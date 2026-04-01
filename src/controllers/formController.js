const ServiceForm = require('../models/ServiceForm');
const AMC = require('../models/AMC');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');
const { generateJobCardPdf, generateServicePdf } = require('../services/pdfHtmlService');
const emailQueue = require('../jobs/emailQueue');

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
    .populate('employeeId', 'name employeeId')
    .populate('branchId', 'branchName branchCode');

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
    new: true,
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

  // Ensure customer has email if we are emailing
  if (!form.customer || !form.customer.email) {
    // Could strictly throw an error, but we'll accept and skip email
  }

  form.status = 'SUBMITTED';
  
  // Auto-assign task to the form creator (if technician/sales/branch_admin)
  const TaskAssignment = require('../models/TaskAssignment');
  const userRole = req.user.role;
  
  let autoAssigned = false;
  if (['technician', 'sales', 'branch_admin'].includes(userRole)) {
    // Create automatic task assignment for the form creator
    const existingAssignment = await TaskAssignment.findOne({
      serviceFormId: form._id,
      status: { $in: ['ASSIGNED', 'ACCEPTED', 'PENDING'] }
    });
    
    if (!existingAssignment) {
      await TaskAssignment.create({
        serviceFormId: form._id,
        assignedTo: req.user._id,
        assignedBy: req.user._id,
        branchId: form.branchId?._id || form.branchId,
        scheduledDate: form.schedule?.date || new Date(),
        notes: 'Auto-assigned from form submission',
        status: 'ASSIGNED',
        assignedAt: new Date()
      });
      autoAssigned = true;
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

  res.status(200).json({
    success: true,
    message: autoAssigned ? 'Form submitted and task assigned to you!' : 'Form submitted successfully',
    data: form,
    autoAssigned,
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
    const shouldCreateAMC = (form.serviceType === 'AMC' || form.serviceType === 'BOTH') 
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
          totalAmount: form.pricing?.finalAmount || 0,
          paidAmount: form.billing?.advance || 0,
          status: 'ACTIVE',
        };
        
        const amc = await AMC.create(amcData);
      } catch (amcError) {
      }
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
    
    const pdfBuffer = await generateJobCardPdf(safeForm);
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }
    
    res.setHeader('Content-disposition', `attachment; filename=JobCard_${form.orderNo || form._id}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    
    return res.send(pdfBuffer);
  } catch (error) {
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
    
    const pdfBuffer = await generateServicePdf(safeForm);

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
