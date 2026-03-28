const ServiceForm = require('../models/ServiceForm');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');
const { generateJobCardPdf } = require('../services/pdfService');
const emailQueue = require('../jobs/emailQueue');

// @desc    Create a new Service Form (Draft)
// @route   POST /api/forms
// @access  Private (Employee/Admin)
exports.createForm = catchAsync(async (req, res, next) => {
  const formPayload = {
    ...req.body,
    employeeId: req.user._id,
    // Use req.body.branchId if super_admin provides it, otherwise default to user's branch
    branchId: (req.user.role === 'super_admin' && req.body.branchId) 
      ? req.body.branchId 
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
    queryObj.branchId = req.user.branchId;
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

  // Role Checks
  if (req.user.role !== 'super_admin') {
    if (form.branchId._id.toString() !== req.user.branchId.toString()) {
      return next(new AppError('Permission Denied', 403));
    }
    if ((req.user.role === 'technician' || req.user.role === 'sales') && form.employeeId._id.toString() !== req.user._id.toString()) {
      return next(new AppError('Access Denied. You can only view your own forms.', 403));
    }
  }

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

  // Restrict updating via auth
  if (req.user.role !== 'super_admin' && form.branchId.toString() !== req.user.branchId.toString()) {
    return next(new AppError('Permission Denied', 403));
  }
  if ((req.user.role === 'technician' || req.user.role === 'sales') && form.employeeId.toString() !== req.user._id.toString()) {
    return next(new AppError('Permission Denied', 403));
  }

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
    message: 'Form submitted successfully',
    data: form,
  });
});

// @desc    Update form status (SCHEDULED, COMPLETED, CANCELLED)
// @route   PATCH /api/forms/:id/status
// @access  Private
exports.updateFormStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const allowedStatuses = ['DRAFT', 'SUBMITTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'];

  if (!allowedStatuses.includes(status)) {
    return next(new AppError('Invalid status value provided', 400));
  }

  const form = await ServiceForm.findById(req.params.id);

  if (!form) {
    return next(new AppError('No service form found with that ID', 404));
  }

  form.status = status;
  await form.save();

  res.status(200).json({
    success: true,
    data: form,
  });
});

// @desc    Download PDF for a form
// @route   GET /api/forms/:id/pdf
// @access  Private
exports.downloadFormPdf = catchAsync(async (req, res, next) => {
  const form = await ServiceForm.findById(req.params.id)
    .populate('branchId', 'branchName branchCode city address phone')
    .populate('employeeId', 'name')
    .populate('customerId', 'name phone email address city gstNo');

  if (!form) {
    return next(new AppError('No service form found with that ID', 404));
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
    console.log('Controller: Starting PDF generation for', form.orderNo);
    console.log('Form customer:', form.customer?.name);
    console.log('Form branch:', form.branchId?.branchName);
    
    const pdfBuffer = await generateJobCardPdf(form);
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }
    
    res.setHeader('Content-disposition', `attachment; filename=JobCard_${form.orderNo || form._id}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    
    console.log('Controller: Sending PDF, size:', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Generation Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Failed to generate PDF: ${error.message}`,
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
        totalRevenue: { $sum: '$billing.total' },
        totalAdvance: { $sum: '$billing.advance' },
        totalPending: { $sum: '$billing.due' },
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
    matchObj.branchId = req.user.branchId;
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
