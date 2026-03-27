const Receipt = require('../models/Receipt');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');
const { generateReceiptPdf } = require('../services/pdfService');
const emailQueue = require('../jobs/emailQueue');

// Helper to enqueue email safely
const emailReceipt = async (receiptId, customerEmail) => {
  if (!customerEmail) return false;

  try {
    await emailQueue.add({
      type: 'SEND_RECEIPT',
      data: { receiptId },
    });
    return true;
  } catch (error) {
    console.warn(`[Email Enqueue Failed] Receipt ${receiptId}:`, error.message);
    return false;
  }
};

// @desc    Create a new Receipt
// @route   POST /api/receipts
// @access  Private (Employee/Admin)
exports.createReceipt = catchAsync(async (req, res, next) => {
  const payload = {
    ...req.body,
    employeeId: req.user._id,
    // If super admin provides branchId in body, use it; else use user's branchId
    branchId: (req.user.role === 'super_admin' && req.body.branchId) ? req.body.branchId : req.user.branchId,
  };

  if (!payload.branchId) {
    return next(new AppError('Branch ID is required to generate a receipt.', 400));
  }

  const receipt = await Receipt.create(payload);

  // Auto-Email customer on creation via Queue
  await emailReceipt(receipt._id, receipt.customerEmail);

  res.status(201).json({
    success: true,
    data: receipt,
  });
});

// @desc    Get all Receipts
// @route   GET /api/receipts
// @access  Private
exports.getReceipts = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Role Based Filtering
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    queryObj.branchId = req.user.branchId;
  } else if (req.user.role === 'technician' || req.user.role === 'sales') {
    queryObj.employeeId = req.user._id;
  }

  // Handle case-insensitive customer name search if provided
  if (queryObj.customerName) {
    queryObj.customerName = { $regex: queryObj.customerName, $options: 'i' };
  }

  let query = Receipt.find(queryObj)
    .populate('employeeId', 'name employeeId')
    .populate('branchId', 'branchName branchCode')
    .populate('formId', 'orderNo status'); // Optional linkage

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

// @desc    Get single Receipt
// @route   GET /api/receipts/:id
// @access  Private
exports.getReceipt = catchAsync(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id)
    .populate('employeeId', 'name employeeId phone')
    .populate('branchId', 'branchName cityPrefix phone')
    .populate('formId', 'orderNo schedule attributes amcServices');

  if (!receipt) {
    return next(new AppError('No receipt found with that ID', 404));
  }

  // Security check: restrict access to their branch/own data
  if (req.user.role !== 'super_admin') {
    if (receipt.branchId._id.toString() !== req.user.branchId.toString()) {
      return next(new AppError('Permission Denied', 403));
    }
    if ((req.user.role === 'technician' || req.user.role === 'sales') && receipt.employeeId._id.toString() !== req.user._id.toString()) {
      return next(new AppError('Access Denied.', 403));
    }
  }

  res.status(200).json({
    success: true,
    data: receipt,
  });
});

// @desc    Update Receipt (Admin overrides only)
// @route   PATCH /api/receipts/:id
// @access  Private (Super / Branch Admin)
exports.updateReceipt = catchAsync(async (req, res, next) => {
  // Prevent changing ownership properties
  delete req.body.employeeId;
  delete req.body.branchId;
  delete req.body.receiptNo;

  const receipt = await Receipt.findById(req.params.id);

  if (!receipt) {
    return next(new AppError('No receipt found with that ID', 404));
  }

  // Basic security check
  if (req.user.role === 'branch_admin' && receipt.branchId.toString() !== req.user.branchId.toString()) {
    return next(new AppError('Permission Denied', 403));
  }

  // Update explicitly to trigger the Pre-Save hooks for math (balanceDue)
  Object.keys(req.body).forEach((key) => {
    receipt[key] = req.body[key];
  });

  await receipt.save();

  res.status(200).json({
    success: true,
    data: receipt,
  });
});

// @desc    Download Receipt PDF
// @route   GET /api/receipts/:id/pdf
// @access  Private
exports.downloadReceiptPdf = catchAsync(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id)
    .populate('formId', 'orderNo')
    .populate('branchId', 'branchName branchCode city address phone');

  if (!receipt) {
    return next(new AppError('No receipt found with that ID', 404));
  }

  try {
    const pdfBuffer = await generateReceiptPdf(receipt);
    
    res.setHeader('Content-disposition', `attachment; filename=Receipt_${receipt.receiptNo}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    
    res.send(pdfBuffer);
  } catch (error) {
    return next(new AppError('Failed to generate PDF document.', 500));
  }
});

// @desc    Resend Receipt Email
// @route   POST /api/receipts/:id/resend
// @access  Private
exports.resendReceiptEmail = catchAsync(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id);

  if (!receipt) return next(new AppError('Receipt not found', 404));
  if (!receipt.customerEmail) return next(new AppError('No email attached to this receipt', 400));

  const success = await emailReceipt(receipt._id, receipt.customerEmail);

  if (!success) {
    return next(new AppError('Failed to resend email.', 500));
  }

  res.status(200).json({
    success: true,
    message: 'Email resent successfully.',
  });
});

// @desc    Get Receipt Stats
// @route   GET /api/receipts/stats
// @access  Private (Admin only)
exports.getReceiptStats = catchAsync(async (req, res, next) => {
  const matchObj = {};
  if (req.user.role === 'branch_admin') {
    matchObj.branchId = req.user.branchId;
  }

  const stats = await Receipt.aggregate([
    { $match: matchObj },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAdvance: { $sum: '$advancePaid' },
        totalPending: { $sum: '$balanceDue' },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: stats,
  });
});
