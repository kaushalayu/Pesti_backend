const ServiceForm = require('../models/ServiceForm');
const AMC = require('../models/AMC');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');
const { generateJobCardPdf } = require('../services/pdfService');
const emailQueue = require('../jobs/emailQueue');
const cache = require('../utils/cache');
const Branch = require('../models/Branch');

// @desc    Create a new Service Form (Draft)
// @route   POST /api/forms
// @access  Private (Employee/Admin)
exports.createForm = catchAsync(async (req, res, next) => {
  // Clean up empty strings - convert to null for ObjectId fields
  const cleanBody = { ...req.body };
  if (!cleanBody.customerId || cleanBody.customerId === '') cleanBody.customerId = null;
  if (!cleanBody.branchId || cleanBody.branchId === '') cleanBody.branchId = null;
  
  const formPayload = {
    ...cleanBody,
    employeeId: req.user._id,
    branchId: (req.user.role === 'super_admin' && cleanBody.branchId) 
      ? cleanBody.branchId 
      : req.user.branchId,
  };

  // Force branchId to be a string ID (prevent [object Object] leakage)
  if (formPayload.branchId && typeof formPayload.branchId === 'object') {
    formPayload.branchId = formPayload.branchId._id ? formPayload.branchId._id.toString() : formPayload.branchId.toString();
  }

  const newForm = await ServiceForm.create(formPayload);

  // Invalidate dashboard cache
  await cache.invalidateStats();

  res.status(201).json({
    success: true,
    data: newForm,
  });
});

// @desc    Get all forms with pagination & filtering
// @route   GET /api/forms
// @access  Private
exports.getForms = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Handle comma-separated status values (e.g., ?status=SUBMITTED,SCHEDULED,COMPLETED)
  if (queryObj.status && queryObj.status.includes(',')) {
    queryObj.status = { $in: queryObj.status.split(',') };
  }

  // Role Based Filtering
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    // Branch admins/office can see all forms for their branch
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (branchId) {
      queryObj.branchId = branchId;
    }
  } else if (req.user.role === 'technician' || req.user.role === 'sales') {
    // Technicians/Sales only see their own forms
    queryObj.employeeId = req.user._id;
  }

  // Handle case-insensitive customer name search if provided
  if (queryObj['customer.name']) {
    queryObj['customer.name'] = { $regex: queryObj['customer.name'], $options: 'i' };
  }

  let query = ServiceForm.find(queryObj)
    .select('-__v -updatedAt')
    .populate('employeeId', 'name employeeId phone')
    .populate('branchId', 'branchName branchCode city');

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  const { data, pagination } = await paginate(query, req.query);

  res.status(200).json({
    success: true,
    count: data.length,
    pagination,
    data,
  });
});

// @desc    Get single form by ID
// @route   GET /api/forms/:id
// @access  Private
exports.getForm = catchAsync(async (req, res, next) => {
  const form = await ServiceForm.findById(req.params.id)
    .populate('employeeId', 'name employeeId phone')
    .populate('branchId', 'branchName branchCode city address phone');

  if (!form) {
    return next(new AppError('No service form found with that ID', 404));
  }

  // Role Checks - Allow branch_admin to see ALL forms in their branch
  // Branch admin can see all forms in their branch, no restriction
  if (req.user.role === 'technician' || req.user.role === 'sales') {
    // Only allow technicians/sales to see their own forms
    const formEmployeeId = form.employeeId?._id?.toString() || form.employeeId?.toString();
    if (formEmployeeId !== req.user._id.toString()) {
      return next(new AppError('Access Denied. You can only view your own forms.', 403));
    }
  }
  // Branch admin can see all forms in their branch - NO BLOCKING

  res.status(200).json({
    success: true,
    data: form,
  });
});

// @desc    Update a Service Form
// @route   PUT /api/forms/:id
// @access  Private
exports.updateForm = catchAsync(async (req, res, next) => {
  const form = await ServiceForm.findById(req.params.id);

  if (!form) {
    return next(new AppError('No service form found with that ID', 404));
  }

  // Once submitted, forms shouldn't be fully editable by regular employees
  if (form.status !== 'DRAFT' && req.user.role !== 'super_admin' && req.user.role !== 'branch_admin') {
    return next(new AppError(`Cannot edit a form in ${form.status} status`, 400));
  }

  // Technician/Sales can only edit their own forms
  if (req.user.role === 'technician' || req.user.role === 'sales') {
    const formEmployeeId = form.employeeId?.toString();
    if (formEmployeeId !== req.user._id.toString()) {
      return next(new AppError('Permission Denied - Can only edit your own forms', 403));
    }
  }
  // Branch admin can edit any form in their branch - ALLOWED

  // Prevent changing ownership properties
  delete req.body.employeeId;
  delete req.body.branchId;
  delete req.body.orderNo;

  const updatedForm = await ServiceForm.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: updatedForm,
  });
});

// @desc    Submit form (Moves from DRAFT to SUBMITTED), generates PDF & Emails client
// @route   POST /api/forms/:id/submit
// @access  Private
exports.submitForm = catchAsync(async (req, res, next) => {
  const form = await ServiceForm.findById(req.params.id)
    .populate('branchId', 'branchName cityPrefix phone email');

  if (!form) {
    return next(new AppError('No service form found with that ID', 404));
  }

  if (form.status !== 'DRAFT') {
    return next(new AppError('Form is already submitted.', 400));
  }

  form.status = 'SUBMITTED';
  
  // Form goes to unassigned list for Admin/SuperAdmin to assign to technician
  // No auto-assignment - Admin will assign manually from Task Assignment page

  // Auto-create Receipt if advance payment was made
  let receiptCreated = null;
  const advanceAmount = parseFloat(form.billing?.advance) || 0;
  if (advanceAmount > 0) {
    try {
      const Receipt = require('../models/Receipt');
      const HQAccount = require('../models/HQAccount');
      const EmployeeLedger = require('../models/EmployeeLedger');
      const BranchLedger = require('../models/BranchLedger');
      const { generateUniqueId } = require('../utils/generateId');
      const User = require('../models/User');
      
      const branch = await Branch.findById(form.branchId?._id || form.branchId).select('branchCode');
      const user = await User.findById(req.user._id).select('employeeId');
      
      const branchCode = branch?.branchCode?.replace(/-/g, '').substring(0, 3) || 'HQ';
      const empCode = user?.employeeId?.replace(/-/g, '').substring(0, 3) || 'S00';
      
      const receipt = await Receipt.create({
        customerName: form.customer?.name || '',
        customerEmail: form.customer?.email || null,
        customerPhone: form.customer?.phone || '',
        customerAddress: form.customer?.address || null,
        customerGstNo: form.customer?.gstNo || null,
        serviceType: form.serviceType || 'AMC',
        category: form.serviceCategory || 'Residential',
        premisesType: form.premises?.type || 'Bunglow',
        paymentMode: form.billing?.paymentMode || 'Cash',
        transactionId: form.billing?.transactionNo || null,
        floors: form.premises?.floors || [],
        totalArea: form.premises?.totalArea || 0,
        formId: form._id,
        amcRatePerSqft: form.contract?.ratePerSqft || 0,
        amcAmount: 0,
        serviceTotal: form.pricing?.baseAmount || 0,
        baseAmount: form.pricing?.baseAmount || 0,
        gstPercent: form.pricing?.gstPercent || 18,
        gstAmount: form.pricing?.gstAmount || 0,
        discountPercent: form.pricing?.discountPercent || 0,
        discountAmount: form.pricing?.discountAmount || 0,
        totalAmount: form.pricing?.finalAmount || 0,
        advancePaid: advanceAmount,
        balanceDue: (form.pricing?.finalAmount || 0) - advanceAmount,
        employeeId: req.user._id,
        branchId: form.branchId?._id || form.branchId,
        receiptNo: generateUniqueId('RCP', branchCode, empCode),
        approvalStatus: 'APPROVED',
        approvedBy: req.user._id,
        approvedAt: new Date(),
        paymentDate: new Date()
      });
      receiptCreated = receipt;

      // Record in HQ Account
      await HQAccount.create({
        type: 'INCOME',
        source: 'CUSTOMER_RECEIPT',
        amount: advanceAmount,
        balanceAfter: 0,
        relatedId: receipt._id,
        relatedModel: 'Receipt',
        branchId: form.branchId?._id || form.branchId,
        customerId: form.customerId,
        description: `Booking Advance - ${form.customer?.name} (${form.billing?.paymentMode})`,
        paymentMode: form.billing?.paymentMode || 'Cash',
        transactionRef: form.billing?.transactionNo,
        performedBy: req.user._id,
        date: new Date()
      });

      // Record in Employee Ledger
      const empBalance = await EmployeeLedger.getUserBalance(req.user._id);
      await EmployeeLedger.create({
        userId: req.user._id,
        branchId: form.branchId?._id || form.branchId,
        type: 'CREDIT',
        category: 'CUSTOMER_RECEIPT',
        amount: advanceAmount,
        balanceAfter: empBalance.balance + advanceAmount,
        relatedId: receipt._id,
        relatedModel: 'Receipt',
        description: `Booking Advance - ${form.customer?.name}`,
        paymentMode: form.billing?.paymentMode || 'Cash',
        transactionRef: form.billing?.transactionNo,
        performedBy: req.user._id,
        date: new Date()
      });

      // Record in Branch Ledger
      const branchBalance = await BranchLedger.getBranchBalance(form.branchId?._id || form.branchId);
      await BranchLedger.create({
        branchId: form.branchId?._id || form.branchId,
        type: 'CREDIT',
        category: 'CUSTOMER_RECEIPT',
        amount: advanceAmount,
        balanceAfter: branchBalance.balance + advanceAmount,
        relatedId: receipt._id,
        relatedModel: 'Receipt',
        employeeId: req.user._id,
        customerId: form.customerId,
        description: `Booking Advance - ${form.customer?.name} by ${req.user.name}`,
        paymentMode: form.billing?.paymentMode || 'Cash',
        transactionRef: form.billing?.transactionNo,
        performedBy: req.user._id,
        date: new Date()
      });
    } catch (receiptError) {
      console.error('Error creating auto-receipt:', receiptError.message);
    }
  }
  
  await form.save();

  if (form.customer && form.customer.email) {
    try {
      await emailQueue.add({
        type: 'SUBMIT_JOB_CARD',
        data: { formId: form._id },
      });
    } catch (error) {
      console.warn('Failed to enqueue job card email:', error.message);
    }
  }

  // Invalidate dashboard and task-assignment caches
  await cache.invalidateStats();
  await cache.del('dashboard');
  await cache.delPattern('dashboard:*');
  await cache.delPattern('cache:task-assignments:*');

  // Notify Admins about new form submission
  try {
    const User = require('../models/User');
    const { createNotification } = require('./notificationController');
    
    const adminQuery = { role: { $in: ['super_admin', 'branch_admin'] }, isActive: true };
    if (form.branchId) {
      adminQuery.branchId = form.branchId;
    }
    const admins = await User.find(adminQuery).select('_id');
    
    for (const admin of admins) {
      await createNotification({
        userId: admin._id,
        type: 'NEW_BOOKING',
        title: 'New Booking Submitted',
        message: `New ${form.serviceType} booking from ${form.customer?.name || 'Customer'}. Amount: ₹${(form.pricing?.finalAmount || 0).toLocaleString()}. Please assign a technician.`,
        relatedId: form._id,
        relatedType: 'FORM',
        data: { formId: form._id, status: 'SUBMITTED' }
      });
    }
  } catch (notifError) {
    console.warn('Notification error:', notifError.message);
  }

  res.status(200).json({
    success: true,
    message: 'Form submitted successfully. Admin will assign a technician.',
    data: form,
    receiptCreated,
  });
});

// @desc    Update form status (SCHEDULED, COMPLETED, CANCELLED)
// @route   PATCH /api/forms/:id/status
// @access  Private (all roles can update status)
exports.updateFormStatus = catchAsync(async (req, res, next) => {
  const { status, notes } = req.body;
  const allowedStatuses = ['DRAFT', 'SUBMITTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'];

  if (!allowedStatuses.includes(status)) {
    return next(new AppError('Invalid status value provided', 400));
  }

  const form = await ServiceForm.findById(req.params.id);

  if (!form) {
    return next(new AppError('No service form found with that ID', 404));
  }

  const oldStatus = form.status;
  const userRole = req.user.role;

  // EVERYONE can directly complete forms - No permission issues!
  // Only restriction: Cannot go backwards (except cancelled)
  const statusOrder = { 'DRAFT': 0, 'SUBMITTED': 1, 'SCHEDULED': 2, 'COMPLETED': 3 };
  
  // Allow direct jumps to COMPLETED from any status (except already completed/cancelled)
  if (status === 'COMPLETED' && oldStatus !== 'COMPLETED' && oldStatus !== 'CANCELLED') {
    // Allowed - Everyone can complete directly!
  }
  // Allow SUBMITTED from DRAFT
  else if (status === 'SUBMITTED' && oldStatus === 'DRAFT') {
    // Allowed
  }
  // Allow SCHEDULED from SUBMITTED
  else if (status === 'SCHEDULED' && oldStatus === 'SUBMITTED') {
    // Allowed
  }
  // Allow COMPLETED from COMPLETED (branch admin re-verification after technician completes)
  else if (status === 'COMPLETED' && oldStatus === 'COMPLETED') {
    // Allowed - branch admin can re-verify
  }
  // Prevent going backwards
  else if (statusOrder[oldStatus] >= statusOrder[status] && status !== 'CANCELLED') {
    return next(new AppError(`Cannot change status from ${oldStatus} to ${status}`, 400));
  }
  // CANCELLED can be set from any non-completed status
  else if (status === 'CANCELLED' && (oldStatus === 'COMPLETED' || oldStatus === 'CANCELLED')) {
    return next(new AppError('Cannot cancel an already completed form', 400));
  }

  // Update status and add history using findByIdAndUpdate to avoid full document validation
  const statusUpdate = {
    $set: { status },
    $push: {
      statusHistory: {
        status,
        changedBy: req.user._id,
        changedAt: new Date(),
        notes: notes || ''
      }
    }
  };

  await ServiceForm.findByIdAndUpdate(req.params.id, statusUpdate);
  
  // Update form object for response
  form.status = status;
  if (!form.statusHistory) form.statusHistory = [];
  form.statusHistory.push({
    status,
    changedBy: req.user._id,
    changedAt: new Date(),
    notes: notes || ''
  });

  // Auto-create AMC contract when form is submitted with AMC services
  if (oldStatus === 'DRAFT' && status === 'SUBMITTED') {
    const shouldCreateAMC = (form.serviceType === 'AMC' || form.serviceType === 'BOTH' || form.serviceType === 'GPC_ATT') 
      && form.amcServices && form.amcServices.length > 0;
    
    if (shouldCreateAMC) {
      try {
        const startDate = form.schedule?.date ? new Date(form.schedule.date) : new Date();
        const period = form.contract?.period || 12;
        const endDate = form.contract?.endDate ? new Date(form.contract.endDate) : new Date(startDate.setMonth(startDate.getMonth() + period));
        
        const amcData = {
          formId: form._id,
          customerId: form.customerId,
          branchId: form.branchId,
          employeeId: form.employeeId,
          customerName: form.customer?.name || '',
          customerPhone: form.customer?.phone || '',
          customerAddress: form.customer?.address || '',
          serviceType: form.serviceCategory || 'Residential',
          premisesType: form.premises?.type || 'Bunglow',
          servicesIncluded: form.amcServices,
          startDate: form.schedule?.date || new Date().toISOString().split('T')[0],
          endDate: form.contract?.endDate || endDate,
          period: period,
          servicesPerMonth: form.schedule?.servicesPerMonth || 1,
          totalServices: form.schedule?.serviceCount || 1,
          interval: form.schedule?.intervalDays || 30,
          totalAmount: form.serviceType === 'GPC_ATT' ? (form.pricing?.gpcSubtotal || 0) : (form.pricing?.finalAmount || 0),
          paidAmount: form.billing?.advance || 0,
          status: 'ACTIVE',
        };
        
        const amc = await AMC.create(amcData);
      } catch (amcError) {
      }
    }
  }

  // Auto-create TaskAssignment when form is SUBMITTED (technician submits booking)
  // This makes it appear in Task Assignment page immediately
  if (oldStatus === 'DRAFT' && status === 'SUBMITTED') {
    try {
      const TaskAssignment = require('../models/TaskAssignment');
      // Check if TaskAssignment already exists for this form
      const existingTasks = await TaskAssignment.find({ serviceFormId: form._id });
      
      // Only create if no TaskAssignment exists
      if (existingTasks.length === 0) {
        await TaskAssignment.create({
          serviceFormId: form._id,
          assignedTo: null,
          assignedBy: form.employeeId,
          branchId: form.branchId,
          scheduledDate: form.schedule?.date || new Date(),
          notes: 'Auto-created when booking form was submitted - awaiting assignment',
          status: 'PENDING'
        });
      } else {
        // TaskAssignment already exists
      }
    } catch (taskError) {
      // Silent fail for auto-creation
    }
  }

  // Auto-create TaskAssignment when form is scheduled
  if (status === 'SCHEDULED' && oldStatus !== 'SCHEDULED') {
    try {
      const TaskAssignment = require('../models/TaskAssignment');
      const existingTasks = await TaskAssignment.find({ serviceFormId: form._id });
      
      if (existingTasks.length === 0) {
        await TaskAssignment.create({
          serviceFormId: form._id,
          assignedTo: null,
          assignedBy: form.employeeId,
          branchId: form.branchId,
          scheduledDate: form.schedule?.date || new Date(),
          notes: 'Auto-created when booking was scheduled - awaiting assignment',
          status: 'PENDING'
        });
      } else {
        // Update scheduled date on existing tasks
        for (const task of existingTasks) {
          if (!task.assignedTo) { // Only update unassigned tasks
            task.scheduledDate = form.schedule?.date || new Date();
            await task.save();
          }
        }
      }
    } catch (taskError) {
      console.error('Error auto-creating TaskAssignment on schedule:', taskError.message);
    }
    
    // Auto-generate Receipt for scheduled booking
    try {
      const Receipt = require('../models/Receipt');
      const Branch = require('../models/Branch');
      const User = require('../models/User');
      const { generateUniqueId } = require('../utils/generateId');
      
      // Check if receipt already exists
      const existingReceipt = await Receipt.findOne({ formId: form._id });
      
      if (!existingReceipt) {
        const branchData = await Branch.findById(form.branchId).select('branchCode');
        const userData = await User.findById(form.employeeId || form.createdBy).select('employeeId');
        
        const branchCode = branchData?.branchCode?.replace(/-/g, '').substring(0, 3) || 'HQ';
        const empCode = userData?.employeeId?.replace(/-/g, '').substring(0, 3) || 'S00';
        const receiptNo = generateUniqueId('RCP', branchCode, empCode);
        
        const totalAmount = form.pricing?.finalAmount || form.billing?.total || 0;
        const advancePaid = form.billing?.advancePaid || form.pricing?.advancePaid || 0;
        const balanceDue = Math.ceil(totalAmount - advancePaid);
        
        await Receipt.create({
          receiptNo: receiptNo,
          formId: form._id,
          customerId: form.customerId?._id || form.customerId,
          customerName: form.customer?.name || '',
          customerEmail: form.customer?.email || '',
          customerPhone: form.customer?.phone || '',
          customerAddress: form.customer?.address || '',
          customerGstNo: form.customer?.gstNo || '',
          branchId: form.branchId,
          employeeId: form.employeeId || form.createdBy,
          serviceDescription: `${form.serviceType || 'AMC'} Service`,
          serviceType: form.serviceType,
          category: form.category,
          premisesType: form.premisesType || 'Bunglow',
          serviceTotal: form.pricing?.baseAmount || totalAmount,
          baseAmount: form.pricing?.baseAmount || totalAmount,
          gstPercent: form.pricing?.gstPercent || 18,
          gstAmount: form.pricing?.gstAmount || 0,
          discountAmount: form.pricing?.discountAmount || 0,
          totalAmount: totalAmount,
          advancePaid: advancePaid,
          balanceDue: balanceDue,
          paymentMode: advancePaid > 0 ? 'PENDING' : 'PENDING',
          status: 'PENDING',
          notes: 'Auto-generated receipt when booking was scheduled',
        });
      }
    } catch (receiptError) {
      // Silent fail for auto-receipt
    }
  }

  // Send notification email based on status
  if (form.customer && form.customer.email) {
    try {
      if (status === 'SCHEDULED') {
        await emailQueue.add({
          type: 'SERVICE_SCHEDULED',
          data: { formId: form._id }
        });
      } else if (status === 'COMPLETED') {
        await emailQueue.add({
          type: 'SERVICE_COMPLETED',
          data: { formId: form._id }
        });
      }
    } catch (error) {
      console.warn('Status notification failed:', error.message);
    }
  }

  res.status(200).json({
    success: true,
    message: `Form status updated to ${status}`,
    data: form,
  });
});

// @desc    Download PDF for a form
// @route   GET /api/forms/:id/pdf
// @access  Private
exports.downloadFormPdf = catchAsync(async (req, res, next) => {
  const ServiceRate = require('../models/ServiceRate');
  
  const form = await ServiceForm.findById(req.params.id)
    .populate('branchId', 'branchName branchCode city address phone')
    .populate('employeeId', 'name employeeId phone')
    .populate('customerId', 'name phone email address city gstNo');

  if (!form) {
    return next(new AppError('No service form found with that ID', 404));
  }

  // Role-based permission check
  // Branch admin can download PDF for any form in their branch
  if (req.user.role === 'technician' || req.user.role === 'sales') {
    const formEmployeeId = form.employeeId?._id?.toString() || form.employeeId?.toString();
    if (formEmployeeId !== req.user._id.toString()) {
      return next(new AppError('Permission Denied - Can only download your own forms', 403));
    }
  }
  // Branch admin can download all forms in their branch - ALLOWED

  if (!form.customer && form.customerId) {
    form.customer = {
      name: form.customerId.name,
      phone: form.customerId.phone,
      email: form.customerId.email,
      address: form.customerId.address,
      city: form.customerId.city,
      gstNo: form.customerId.gstNo
    };
  }

  try {
    // Fetch service rates for the PDF
    let serviceRates = {};
    try {
      const rates = await ServiceRate.find({
        category: form.serviceCategory,
        ...(form.branchId ? { branchId: form.branchId._id || form.branchId } : {})
      });
      rates.forEach(r => { serviceRates[r.serviceName] = r.price; });
    } catch (rateError) {
    }
    
    const employeeName = form.employeeId?.name || formDoc?.employeeId?.name || 'N/A';
    
    const safeForm = {
      ...form.toObject ? form.toObject() : form,
      customer: form.customer || {},
      branchId: form.branchId || { branchName: 'N/A', city: 'N/A' },
      employeeId: form.employeeId || { name: employeeName },
      serviceProvider: employeeName,
      billing: form.billing || { total: 0, advance: 0, due: 0, discount: 0, paymentMode: 'N/A' },
      schedule: form.schedule || { type: 'N/A', date: '', time: '' },
      premises: form.premises || {},
      contract: form.contract || {},
      amcServices: form.amcServices || [],
      serviceCategory: form.serviceCategory || 'N/A',
      status: form.status || 'N/A',
      createdAt: form.createdAt || new Date(),
      ratePerSqft: form.ratePerSqft || 0,
      perFloorExtra: form.perFloorExtra || 0,
      pesticides: form.pesticides || [],
      serviceDetails: form.serviceDetails || {},
      serviceRates: serviceRates
    };
    
    let pdfBuffer;
    try {
      pdfBuffer = await generateJobCardPdf(safeForm);
    } catch (pdfError) {
      console.error('PDF Generation Error:', pdfError);
      // Return a simple error message instead of 500
      return res.status(500).json({ 
        success: false, 
        message: 'PDF generation failed. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? pdfError.message : undefined
      });
    }
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }
    
    res.setHeader('Content-disposition', `attachment; filename=JobCard_${form.orderNo || form._id}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Download Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Failed to generate PDF: ${error.message}`,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @desc    Download PDF for a specific service in AMC
// @route   GET /api/forms/:id/service/:serviceIndex/pdf
// @access  Private
exports.downloadServicePdf = catchAsync(async (req, res, next) => {
  const ServiceRate = require('../models/ServiceRate');
  
  const { id, serviceIndex } = req.params;
  const serviceNum = parseInt(serviceIndex) + 1;
  
  const form = await ServiceForm.findById(id)
    .populate('branchId', 'branchName branchCode city address phone')
    .populate('employeeId', 'name employeeId phone')
    .populate('customerId', 'name phone email address city gstNo');

  if (!form) {
    return next(new AppError('No service form found with that ID', 404));
  }

  // Role-based permission check
  if (req.user.role === 'technician' || req.user.role === 'sales') {
    const formEmployeeId = form.employeeId?._id?.toString() || form.employeeId?.toString();
    if (formEmployeeId !== req.user._id.toString()) {
      return next(new AppError('Permission Denied - Can only download your own forms', 403));
    }
  }

  if (!form.customer && form.customerId) {
    form.customer = {
      name: form.customerId.name,
      phone: form.customerId.phone,
      email: form.customerId.email,
      address: form.customerId.address,
      city: form.customerId.city,
      gstNo: form.customerId.gstNo
    };
  }

  try {
    // Fetch service rates for the PDF
    let serviceRates = {};
    try {
      const rates = await ServiceRate.find({
        category: form.serviceCategory,
        ...(form.branchId ? { branchId: form.branchId._id || form.branchId } : {})
      });
      rates.forEach(r => { serviceRates[r.serviceName] = r.price; });
    } catch (rateErr) {
    }

    // Get the specific scheduled date
    const scheduledDates = form.schedule?.scheduledDates || [];
    const selectedService = scheduledDates[parseInt(serviceIndex)];
    
    // Create a safe copy of form for PDF generation
    const safeForm = form.toObject();
    
    // Add service number info to the form
    safeForm.currentServiceNumber = serviceNum;
    safeForm.totalServices = scheduledDates.length;
    safeForm.serviceDate = selectedService?.date || form.schedule?.date || '';
    safeForm.serviceFormatted = selectedService?.formatted || '';
    
    // Use the same job card PDF generator for individual service
    const pdfBuffer = await generateJobCardPdf(safeForm);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }
    
    res.setHeader('Content-disposition', `attachment; filename=JobCard_${form.orderNo}_Service${serviceNum}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Service PDF Generation Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Failed to generate service PDF: ${error.message}`,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @desc    Get form stats (Aggregation pipeline)
// @route   GET /api/forms/stats
// @access  Private (Super Admin / Branch Admin)
exports.getFormStats = catchAsync(async (req, res, next) => {
  
  const matchObj = {};
  if (req.user.role === 'branch_admin') {
    matchObj.branchId = req.user.branchId;
  }

  const stats = await ServiceForm.aggregate([
    { $match: matchObj },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRevenue: { $sum: { $ifNull: ['$pricing.finalAmount', '$billing.total', 0] } },
        totalAdvance: { $sum: { $ifNull: ['$billing.advance', 0] } },
        totalPending: { $sum: { $ifNull: ['$billing.due', 0] } },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: stats,
  });
});

// @desc    Export Forms to CSV
// @route   GET /api/forms/export
// @access  Private (Super Admin / Branch Admin / Office)
exports.exportFormsCSV = catchAsync(async (req, res, next) => {
  const matchObj = {};
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (!branchId) {
      return next(new AppError('Branch not assigned to user', 400));
    }
    matchObj.branchId = branchId;
  }

  const forms = await ServiceForm.find(matchObj)
    .populate('employeeId', 'name')
    .populate('branchId', 'branchName city')
    .sort('-createdAt')
    .lean();

  const csvHeaders = [
    'Order No', 'Date', 'Status', 'Branch', 'Employee', 
    'Customer Name', 'Phone', 'City', 'Service Type',
    'Total Amount', 'Advance', 'Due', 'Payment Mode'
  ];

  const csvRows = forms.map(form => [
    form.orderNo || '',
    form.createdAt ? new Date(form.createdAt).toLocaleDateString('en-IN') : '',
    form.status || '',
    form.branchId?.branchName || '',
    form.employeeId?.name || '',
    form.customer?.name || '',
    form.customer?.phone || '',
    form.customer?.city || '',
    form.serviceCategory || '',
    form.billing?.total || 0,
    form.billing?.advance || 0,
    form.billing?.due || 0,
    form.billing?.paymentMode || ''
  ]);

  const csvContent = [
    csvHeaders.join(','),
    ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=ServiceForms_${Date.now()}.csv`);
  res.send(csvContent);
});
