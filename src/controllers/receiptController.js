const Receipt = require('../models/Receipt');
const ServiceForm = require('../models/ServiceForm');
const AMC = require('../models/AMC');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');
const { generateReceiptPdf } = require('../services/pdfHtmlService');
const { generateUniqueId } = require('../utils/generateId');
const emailQueue = require('../jobs/emailQueue');
const Branch = require('../models/Branch');
const User = require('../models/User');
const HQAccount = require('../models/HQAccount');
const EmployeeLedger = require('../models/EmployeeLedger');
const BranchLedger = require('../models/BranchLedger');

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
  const paymentScreenshotUrl = req.body?.paymentScreenshot || null;

  // Safe JSON parse helper
  const safeJsonParse = (str, defaultVal) => {
    if (!str) return defaultVal;
    if (typeof str !== 'string') return str;
    try {
      return JSON.parse(str);
    } catch (e) {
      console.error('JSON parse error:', e.message);
      return defaultVal;
    }
  };

  // Parse JSON strings from FormData
  const floors = safeJsonParse(req.body?.floors, []);
  const attDetails = safeJsonParse(req.body?.attDetails, {});
  
  // Calculate total area
  const totalArea = floors.reduce((sum, f) => sum + (parseFloat(f.area) || 0), 0);
  
  // AMC Contract details
  const amcId = req.body?.amcId || null;
  const formId = req.body?.formId || null;
  let amcData = null;
  if (amcId && (req.body?.serviceType === 'AMC' || req.body?.serviceType === 'BOTH')) {
    amcData = await AMC.findById(amcId);
  }
  
  // AMC amount from contract (rounded up - no decimals)
  const amcRatePerSqft = parseFloat(req.body?.amcRatePerSqft) || 0;
  const amcAmount = Math.ceil(amcRatePerSqft * totalArea);
  
  // ATT details with rate (rounded up - no decimals)
  const attRatePerSqft = parseFloat(req.body?.attRatePerSqft) || 0;
  const attAmount = Math.ceil(attRatePerSqft * totalArea);
  
  // Calculate amounts (rounded up - no decimals)
  const baseAmount = Math.ceil(parseFloat(req.body?.baseAmount) || (amcAmount + attAmount));
  const gstPercent = parseFloat(req.body?.gstPercent) || 18;
  const discountPercent = parseFloat(req.body?.discountPercent) || 0;
  const gstAmount = Math.ceil(baseAmount * gstPercent / 100);
  const afterGst = baseAmount + gstAmount;
  const discountAmount = Math.ceil(afterGst * discountPercent / 100);
  const totalAmount = Math.ceil(afterGst - discountAmount);
  const advancePaid = Math.ceil(parseFloat(req.body?.advancePaid) || 0);
  const balanceDue = Math.ceil(totalAmount - advancePaid);

  const payload = {
    customerName: req.body?.customerName,
    customerEmail: req.body?.customerEmail || null,
    customerPhone: req.body?.customerPhone,
    customerAddress: req.body?.customerAddress || null,
    customerGstNo: req.body?.customerGstNo || null,
    serviceType: req.body?.serviceType || 'AMC',
    category: req.body?.category || 'Residential',
    premisesType: req.body?.premisesType || 'Bunglow',
    serviceDescription: req.body?.serviceDescription || null,
    paymentMode: req.body?.paymentMode,
    transactionId: req.body?.transactionId || null,
    paymentScreenshot: paymentScreenshotUrl,
    notes: req.body?.notes || null,
    floors: floors,
    totalArea: totalArea,
    amcId: amcId,
    formId: formId,
    amcRatePerSqft: amcRatePerSqft,
    amcAmount: amcAmount,
    attDetails: {
      ...attDetails,
      ratePerSqft: attRatePerSqft
    },
    attAmount: attAmount,
    serviceTotal: baseAmount,
    baseAmount: baseAmount,
    gstPercent: gstPercent,
    gstAmount: gstAmount,
    discountPercent: discountPercent,
    discountAmount: discountAmount,
    totalAmount: totalAmount,
    advancePaid: advancePaid,
    balanceDue: balanceDue,
    employeeId: req.user._id,
    branchId: (req.user.role === 'super_admin' && req.body?.branchId) ? req.body.branchId : req.user.branchId,
  };

  if (!payload.branchId) {
    return next(new AppError('Branch ID is required to generate a receipt.', 400));
  }

  const branch = await Branch.findById(payload.branchId).select('branchCode');
  const user = await User.findById(req.user._id).select('employeeId');
  
  const branchCode = branch?.branchCode?.replace(/-/g, '').substring(0, 3) || 'HQ';
  const empCode = user?.employeeId?.replace(/-/g, '').substring(0, 3) || 'S00';
  payload.receiptNo = generateUniqueId('RCP', branchCode, empCode);

  // Auto-approve for EVERYONE - No approval needed!
  payload.approvalStatus = 'APPROVED';
  payload.approvedBy = req.user._id;
  payload.approvedAt = new Date();

  const receipt = await Receipt.create(payload);

  // Record in HQ Account - Customer Payment (BRANCH COLLECTION)
  if (receipt.advancePaid > 0) {
    await HQAccount.create({
      type: 'INCOME',
      source: 'CUSTOMER_RECEIPT',
      amount: receipt.advancePaid,
      balanceAfter: 0,
      relatedId: receipt._id,
      relatedModel: 'Receipt',
      branchId: receipt.branchId,
      customerId: receipt.customerId,
      description: `Receipt ${receipt.receiptNo} - ${receipt.customerName} (${receipt.paymentMode})`,
      paymentMode: receipt.paymentMode,
      transactionRef: receipt.transactionId,
      performedBy: req.user._id,
      date: receipt.paymentDate || new Date()
    });

    // Record in Employee Ledger
    const empBalance = await EmployeeLedger.getUserBalance(req.user._id);
    await EmployeeLedger.create({
      userId: req.user._id,
      branchId: receipt.branchId,
      type: 'CREDIT',
      category: 'CUSTOMER_RECEIPT',
      amount: receipt.advancePaid,
      balanceAfter: empBalance.balance + receipt.advancePaid,
      relatedId: receipt._id,
      relatedModel: 'Receipt',
      description: `Receipt ${receipt.receiptNo} - ${receipt.customerName}`,
      paymentMode: receipt.paymentMode,
      transactionRef: receipt.transactionId,
      performedBy: req.user._id,
      date: receipt.paymentDate || new Date()
    });

    // Record in Branch Ledger
    const branchBalance = await BranchLedger.getBranchBalance(receipt.branchId);
    await BranchLedger.create({
      branchId: receipt.branchId,
      type: 'CREDIT',
      category: 'CUSTOMER_RECEIPT',
      amount: receipt.advancePaid,
      balanceAfter: branchBalance.balance + receipt.advancePaid,
      relatedId: receipt._id,
      relatedModel: 'Receipt',
      employeeId: req.user._id,
      customerId: receipt.customerId,
      description: `Receipt ${receipt.receiptNo} - ${receipt.customerName} by ${req.user.name}`,
      paymentMode: receipt.paymentMode,
      transactionRef: receipt.transactionId,
      performedBy: req.user._id,
      date: receipt.paymentDate || new Date()
    });
  }

  // Update ServiceForm billing if receipt is from a booking
  if (formId && receipt.advancePaid > 0) {
    try {
      const serviceForm = await ServiceForm.findById(formId);
      if (serviceForm) {
        // Calculate total paid from all receipts for this form
        const allReceiptsForForm = await Receipt.find({ formId: formId, approvalStatus: 'APPROVED' });
        const totalPaid = allReceiptsForForm.reduce((sum, r) => sum + (r.advancePaid || 0), 0);
        const formTotal = serviceForm.pricing?.finalAmount || serviceForm.billing?.total || 0;
        const newBalanceDue = formTotal - totalPaid;
        
        // Update the form's billing section
        await ServiceForm.findByIdAndUpdate(formId, {
          'billing.total': formTotal,
          'billing.advance': totalPaid,
          'billing.due': newBalanceDue,
          'billing.paymentMode': receipt.paymentMode,
          'billing.transactionNo': receipt.transactionId,
          'billing.lastPaymentDate': receipt.paymentDate || new Date()
        });
        
        // Update status to COMPLETED if fully paid
        if (newBalanceDue <= 0) {
          await ServiceForm.findByIdAndUpdate(formId, {
            status: 'COMPLETED',
            $push: {
              statusHistory: {
                status: 'COMPLETED',
                changedBy: req.user._id,
                changedAt: new Date(),
                notes: `Payment completed via receipt ${receipt.receiptNo}`
              }
            }
          });
        }
        
        console.log(`ServiceForm ${formId} billing updated: advance=${totalPaid}, due=${newBalanceDue}`);
      }
    } catch (err) {
      console.error('Error updating ServiceForm billing:', err.message);
    }
  }

  // Send email for all receipts
  await emailReceipt(receipt._id, receipt.customerEmail);

  res.status(201).json({
    success: true,
    data: receipt,
    autoApproved: true
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
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (branchId) {
      queryObj.branchId = branchId;
    }
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
    .populate('amcId', 'contractNo startDate endDate period servicesIncluded status')
    .populate('formId', 'orderNo status');

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
    .populate('formId', 'orderNo schedule attributes amcServices')
    .populate('amcId', 'contractNo startDate endDate period servicesIncluded status');

  if (!receipt) {
    return next(new AppError('No receipt found with that ID', 404));
  }

  // Security check: restrict access to their branch/own data
  if (req.user.role !== 'super_admin') {
    const recBranchId = receipt.branchId?._id?.toString() || receipt.branchId?.toString();
    const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (recBranchId !== userBranchId) {
      return next(new AppError('Permission Denied', 403));
    }
    if ((req.user.role === 'technician' || req.user.role === 'sales') && receipt.employeeId?._id?.toString() !== req.user._id.toString()) {
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
  const recBranchId = receipt.branchId?.toString();
  const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
  if (req.user.role === 'branch_admin' && recBranchId !== userBranchId) {
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
    .populate('formId', 'orderNo status')
    .populate('branchId', 'branchName branchCode city address phone')
    .populate('amcId', 'contractNo startDate endDate period servicesIncluded status');

  if (!receipt) {
    return next(new AppError('No receipt found with that ID', 404));
  }

  try {
    const { generateReceiptPdf: generatePdf } = require('../services/pdfService');
    const pdfBuffer = await generatePdf(receipt);
    
    res.setHeader('Content-disposition', `attachment; filename=Receipt_${receipt.receiptNo}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Receipt PDF generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate PDF. Please try again later.'
    });
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

// @desc    Approve Receipt
// @route   PATCH /api/receipts/:id/approve
// @access  Private (All users can approve)
exports.approveReceipt = catchAsync(async (req, res, next) => {
  // EVERYONE can approve receipts - No permission needed!
  // if (req.user.role !== 'super_admin' && req.user.role !== 'branch_admin') {
  //   return next(new AppError('Only Admin can approve receipts', 403));
  // }

  const receipt = await Receipt.findById(req.params.id);

  if (!receipt) {
    return next(new AppError('Receipt not found', 404));
  }

  if (receipt.approvalStatus === 'APPROVED') {
    return next(new AppError('Receipt is already approved', 400));
  }

  receipt.approvalStatus = 'APPROVED';
  receipt.approvedBy = req.user._id;
  receipt.approvedAt = new Date();
  await receipt.save({ validateBeforeSave: false });

  await Notification.create({
    userId: receipt.employeeId,
    type: 'RECEIPT_APPROVED',
    title: 'Receipt Approved!',
    message: `Your receipt ${receipt.receiptNo} for ₹${receipt.totalAmount} has been approved.`,
    relatedId: receipt._id,
    relatedType: 'Receipt',
  });

  if (receipt.customerEmail) {
    try {
      await emailQueue.add({
        type: 'SEND_RECEIPT',
        data: { receiptId: receipt._id },
      });
      await Receipt.findByIdAndUpdate(receipt._id, { emailSentAt: new Date() });
    } catch (error) {
      console.warn('Email send failed:', error.message);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Receipt approved and email sent to customer',
    data: receipt,
  });
});

// @desc    Reject Receipt
// @route   PATCH /api/receipts/:id/reject
// @access  Private (Super Admin only)
exports.rejectReceipt = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'branch_admin') {
    return next(new AppError('Only Admin can reject receipts', 403));
  }

  const { reason } = req.body;

  const receipt = await Receipt.findById(req.params.id);

  if (!receipt) {
    return next(new AppError('Receipt not found', 404));
  }

  if (receipt.approvalStatus === 'APPROVED') {
    return next(new AppError('Cannot reject an already approved receipt', 400));
  }

  receipt.approvalStatus = 'REJECTED';
  receipt.rejectionReason = reason || 'No reason provided';
  await receipt.save();

  await Notification.create({
    userId: receipt.employeeId,
    type: 'RECEIPT_REJECTED',
    title: 'Receipt Rejected',
    message: `Your receipt ${receipt.receiptNo} has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
    relatedId: receipt._id,
    relatedType: 'Receipt',
  });

  res.status(200).json({
    success: true,
    message: 'Receipt rejected',
    data: receipt,
  });
});

// @desc    Get Pending Approvals (for dashboard)
// @route   GET /api/receipts/pending
// @access  Private (Super Admin only)
exports.getPendingApprovals = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return next(new AppError('Only Super Admin can view pending approvals', 403));
  }

  const pendingReceipts = await Receipt.find({ approvalStatus: 'PENDING' })
    .populate('employeeId', 'name')
    .populate('branchId', 'branchName')
    .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: pendingReceipts.length,
    data: pendingReceipts,
  });
});

// @desc    Auto-generate Receipt from Booking Form
// @route   POST /api/receipts/from-form/:formId
// @access  Private (Admin only)
exports.generateFromForm = catchAsync(async (req, res, next) => {
  const { formId } = req.params;
  const { advancePaid, paymentMode, transactionId, notes, paymentScreenshot } = req.body;

  if (!advancePaid || advancePaid <= 0) {
    return next(new AppError('Advance paid amount is required', 400));
  }

  if (!paymentMode) {
    return next(new AppError('Payment mode is required', 400));
  }

  const form = await ServiceForm.findById(formId)
    .populate('customerId', 'name email phone address gstNo')
    .populate('branchId', 'branchName branchCode');

  if (!form) {
    return next(new AppError('Booking form not found', 404));
  }

  const customer = form.customer || form.customerId || {};
  const branch = form.branchId || {};
  const branchId = branch._id || form.branchId;

  if (!branchId) {
    return next(new AppError('Branch ID is required to generate a receipt.', 400));
  }

  const branchData = await Branch.findById(branchId).select('branchCode');
  const employeeId = form.employeeId || req.user._id;
  const userData = await User.findById(req.user._id).select('employeeId');
  
  const branchCode = branchData?.branchCode?.replace(/-/g, '').substring(0, 3) || 'HQ';
  const empCode = userData?.employeeId?.replace(/-/g, '').substring(0, 3) || 'S00';
  const receiptNo = generateUniqueId('RCP', branchCode, empCode);

  const paymentScreenshotUrl = paymentScreenshot || null;

  const totalAmount = form.pricing?.finalAmount || form.billing?.total || 0;
  const balanceDue = Math.ceil(totalAmount - parseFloat(advancePaid));

  const receipt = await Receipt.create({
    receiptNo: receiptNo,
    formId: form._id,
    customerId: form.customerId?._id || form.customerId,
    customerName: customer.name || '',
    customerEmail: customer.email || '',
    customerPhone: customer.phone || '',
    customerAddress: customer.address || '',
    customerGstNo: customer.gstNo || '',
    branchId: branchId,
    employeeId: employeeId,
    serviceDescription: `${form.serviceType || 'AMC'} Service - ${(form.amcServices || []).join(', ')}`,
    services: form.amcServices?.map(service => ({
      name: service,
      ratePerSqft: form.ratePerSqft || 0,
      totalArea: form.premises?.totalArea || 0,
      amount: (form.ratePerSqft || 0) * (form.premises?.totalArea || 0)
    })) || [],
    serviceTotal: form.pricing?.baseAmount || 0,
    floorExtraTotal: 0,
    baseAmount: form.pricing?.baseAmount || form.pricing?.finalAmount || form.billing?.total || 0,
    gstPercent: form.pricing?.gstPercent || 18,
    gstAmount: form.pricing?.gstAmount || 0,
    discountPercent: form.pricing?.discountPercent || 0,
    discountAmount: form.pricing?.discountAmount || 0,
    totalAmount: totalAmount,
    advancePaid: parseFloat(advancePaid),
    balanceDue: balanceDue,
    paymentMode: paymentMode.toUpperCase(),
    transactionId: transactionId || null,
    notes: notes || '',
    paymentScreenshot: paymentScreenshotUrl,
    approvalStatus: 'APPROVED',
    approvedBy: req.user._id,
    approvedAt: new Date(),
  });

  // Record in HQ Account - Customer Payment (BRANCH COLLECTION)
  if (receipt.advancePaid > 0) {
    await HQAccount.create({
      type: 'INCOME',
      source: 'CUSTOMER_RECEIPT',
      amount: receipt.advancePaid,
      balanceAfter: 0,
      relatedId: receipt._id,
      relatedModel: 'Receipt',
      branchId: receipt.branchId,
      customerId: receipt.customerId,
      description: `Receipt ${receipt.receiptNo} - ${receipt.customerName} (${receipt.paymentMode})`,
      paymentMode: receipt.paymentMode,
      transactionRef: receipt.transactionId,
      performedBy: req.user._id,
      date: receipt.paymentDate || new Date()
    });

    // Record in Employee Ledger
    const empBalance = await EmployeeLedger.getUserBalance(employeeId);
    await EmployeeLedger.create({
      userId: employeeId,
      branchId: receipt.branchId,
      type: 'CREDIT',
      category: 'CUSTOMER_RECEIPT',
      amount: receipt.advancePaid,
      balanceAfter: empBalance.balance + receipt.advancePaid,
      relatedId: receipt._id,
      relatedModel: 'Receipt',
      description: `Receipt ${receipt.receiptNo} - ${receipt.customerName}`,
      paymentMode: receipt.paymentMode,
      transactionRef: receipt.transactionId,
      performedBy: req.user._id,
      date: receipt.paymentDate || new Date()
    });

    // Record in Branch Ledger
    const branchBalance = await BranchLedger.getBranchBalance(receipt.branchId);
    await BranchLedger.create({
      branchId: receipt.branchId,
      type: 'CREDIT',
      category: 'CUSTOMER_RECEIPT',
      amount: receipt.advancePaid,
      balanceAfter: branchBalance.balance + receipt.advancePaid,
      relatedId: receipt._id,
      relatedModel: 'Receipt',
      employeeId: employeeId,
      customerId: receipt.customerId,
      description: `Receipt ${receipt.receiptNo} - ${receipt.customerName} by ${req.user.name}`,
      paymentMode: receipt.paymentMode,
      transactionRef: receipt.transactionId,
      performedBy: req.user._id,
      date: receipt.paymentDate || new Date()
    });
  }

  // Update ServiceForm billing
  try {
    const allReceiptsForForm = await Receipt.find({ formId: formId, approvalStatus: 'APPROVED' });
    const totalPaid = allReceiptsForForm.reduce((sum, r) => sum + (r.advancePaid || 0), 0);
    const formTotal = form.pricing?.finalAmount || form.billing?.total || 0;
    const newBalanceDue = formTotal - totalPaid;
    
    await ServiceForm.findByIdAndUpdate(formId, {
      'billing.total': formTotal,
      'billing.advance': totalPaid,
      'billing.due': newBalanceDue,
      'billing.paymentMode': receipt.paymentMode,
      'billing.transactionNo': receipt.transactionId,
      'billing.lastPaymentDate': receipt.paymentDate || new Date()
    });
    
    // Update status to COMPLETED if fully paid
    if (newBalanceDue <= 0) {
      await ServiceForm.findByIdAndUpdate(formId, {
        status: 'COMPLETED',
        $push: {
          statusHistory: {
            status: 'COMPLETED',
            changedBy: req.user._id,
            changedAt: new Date(),
            notes: `Payment completed via receipt ${receipt.receiptNo}`
          }
        }
      });
    }
    
    console.log(`ServiceForm ${formId} billing updated via generateFromForm: advance=${totalPaid}, due=${newBalanceDue}`);
  } catch (err) {
    console.error('Error updating ServiceForm billing:', err.message);
  }

  await Notification.create({
    userId: form.employeeId,
    type: 'RECEIPT_GENERATED',
    title: 'Receipt Generated',
    message: `Receipt ${receipt.receiptNo} generated for booking ${form.orderNo}. Amount: Rs. ${advancePaid}`,
    relatedId: receipt._id,
    relatedType: 'Receipt',
  });

  await emailReceipt(receipt._id, receipt.customerEmail);

  res.status(201).json({
    success: true,
    message: 'Receipt generated successfully',
    data: receipt,
  });
});
