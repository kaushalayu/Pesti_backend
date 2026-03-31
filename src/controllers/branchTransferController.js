const BranchTransfer = require('../models/BranchTransfer');
const Chemical = require('../models/Chemical');
const Inventory = require('../models/Inventory');
const Branch = require('../models/Branch');
const InventoryTransaction = require('../models/InventoryTransaction');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create transfer from HQ to Branch
// @route   POST /api/branch-transfers
// @access  Super Admin
exports.createBranchTransfer = catchAsync(async (req, res, next) => {
  const { branchId, items, notes, transferDate } = req.body;
  
  if (!branchId) {
    return next(new AppError('Branch is required', 400));
  }
  
  if (!items || items.length === 0) {
    return next(new AppError('At least one item is required', 400));
  }
  
  const branch = await Branch.findById(branchId);
  if (!branch) {
    return next(new AppError('Branch not found', 404));
  }
  
  let totalQty = 0;
  let totalCostValue = 0;
  let totalTransferValue = 0;
  const enrichedItems = [];
  
  for (const item of items) {
    const chemical = await Chemical.findById(item.chemicalId);
    if (!chemical) {
      return next(new AppError(`Chemical not found: ${item.chemicalId}`, 404));
    }
    
    const quantity = parseFloat(item.quantity) || 0;
    const costRate = chemical.purchasePrice || 0;
    const transferRate = Math.round(costRate * 1.10 * 100) / 100; // 10% margin
    const costValue = Math.round(quantity * costRate * 100) / 100;
    const transferValue = Math.round(quantity * transferRate * 100) / 100;
    
    if (chemical.mainStock < quantity) {
      return next(new AppError(`Insufficient stock for ${chemical.name}. Available: ${chemical.mainStock}`, 400));
    }
    
    totalQty += quantity;
    totalCostValue += costValue;
    totalTransferValue += transferValue;
    
    enrichedItems.push({
      chemicalId: item.chemicalId,
      chemicalName: chemical.name,
      category: chemical.category,
      quantity: quantity,
      unit: item.unit || chemical.unitSystem || 'L',
      costRate: costRate,
      transferRate: transferRate,
      costValue: costValue,
      transferValue: transferValue
    });
  }
  
  const transfer = await BranchTransfer.create({
    branchId,
    items: enrichedItems,
    totalQuantity: totalQty,
    totalCostValue: totalCostValue,
    totalTransferValue: totalTransferValue,
    notes: notes || '',
    transferDate: transferDate || new Date(),
    createdBy: req.user._id,
    status: 'PENDING'
  });
  
  await transfer.populate('branchId', 'branchName branchCode');
  
  res.status(201).json({
    success: true,
    data: transfer
  });
});

// @desc    Get all branch transfers
// @route   GET /api/branch-transfers
// @access  Super Admin, Branch Admin
exports.getBranchTransfers = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, status, branchId } = req.query;
  
  let query = {};
  
  if (req.user.role === 'branch_admin') {
    const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    query.branchId = branchId;
  } else if (branchId) {
    query.branchId = branchId;
  }
  
  if (status) query.status = status;
  
  const skip = (page - 1) * limit;
  
  const transfers = await BranchTransfer.find(query)
    .populate('branchId', 'branchName branchCode')
    .populate('createdBy', 'name')
    .populate('acceptedBy', 'name')
    .sort('-createdAt')
    .skip(skip)
    .limit(parseInt(limit));
  
  const total = await BranchTransfer.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: transfers,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get single branch transfer
// @route   GET /api/branch-transfers/:id
// @access  Super Admin, Branch Admin
exports.getBranchTransferById = catchAsync(async (req, res, next) => {
  const transfer = await BranchTransfer.findById(req.params.id)
    .populate('branchId', 'branchName branchCode')
    .populate('createdBy', 'name')
    .populate('acceptedBy', 'name')
    .populate('items.chemicalId', 'name category mainStock');
  
  if (!transfer) {
    return next(new AppError('Transfer not found', 404));
  }
  
  // Check authorization
  if (req.user.role === 'branch_admin') {
    const userBranchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    if (transfer.branchId._id.toString() !== userBranchId.toString()) {
      return next(new AppError('Not authorized', 403));
    }
  }
  
  res.status(200).json({
    success: true,
    data: transfer
  });
});

// @desc    Approve branch transfer (Branch Admin accepts)
// @route   PATCH /api/branch-transfers/:id/approve
// @access  Branch Admin
exports.approveBranchTransfer = catchAsync(async (req, res, next) => {
  const transfer = await BranchTransfer.findById(req.params.id);
  
  if (!transfer) {
    return next(new AppError('Transfer not found', 404));
  }
  
  if (transfer.status !== 'PENDING') {
    return next(new AppError('Transfer already processed', 400));
  }
  
  // Verify branch authorization
  const userBranchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
  if (transfer.branchId.toString() !== userBranchId.toString()) {
    return next(new AppError('Not authorized for this branch', 403));
  }
  
  // Deduct from HQ stock and add to branch
  for (const item of transfer.items) {
    const chemical = await Chemical.findById(item.chemicalId);
    if (chemical.mainStock < item.quantity) {
      return next(new AppError(`Insufficient HQ stock for ${item.chemicalName}`, 400));
    }
    
    // Deduct from HQ
    chemical.mainStock -= item.quantity;
    await chemical.save();
    
    // Add to branch inventory
    let branchInv = await Inventory.findOne({
      chemicalId: item.chemicalId,
      ownerId: transfer.branchId,
      ownerType: 'Branch'
    });
    
    if (branchInv) {
      branchInv.quantity += item.quantity;
      branchInv.totalValue = Math.round(branchInv.quantity * branchInv.transferRate * 100) / 100;
      await branchInv.save();
    } else {
      await Inventory.create({
        chemicalId: item.chemicalId,
        ownerId: transfer.branchId,
        ownerType: 'Branch',
        quantity: item.quantity,
        unit: item.unit,
        transferRate: item.transferRate,
        unitPrice: item.transferRate,
        totalValue: item.transferValue,
        originalQuantity: item.quantity,
        purchaseRate: item.costRate
      });
    }
    
    // Create transaction
    await InventoryTransaction.create({
      txnType: 'TRANSFER_TO_BRANCH',
      chemicalId: item.chemicalId,
      fromId: req.user._id,
      fromType: 'super_admin',
      toId: transfer.branchId,
      toType: 'Branch',
      quantity: item.quantity,
      unit: item.unit,
      purchaseRate: item.costRate,
      transferRate: item.transferRate,
      unitPrice: item.transferRate,
      totalValue: item.transferValue,
      type: 'TRANSFER',
      notes: `Branch Transfer ID: ${transfer.transferNo}`,
      performedBy: req.user._id
    });
  }
  
  // Update branch balance (add to pending)
  const branch = await Branch.findById(transfer.branchId);
  branch.totalReceivedValue += transfer.totalTransferValue;
  branch.pendingBalance += transfer.totalTransferValue;
  await branch.save();
  
  // Update transfer status
  transfer.status = 'ACCEPTED';
  transfer.acceptedAt = new Date();
  transfer.acceptedBy = req.user._id;
  await transfer.save();
  
  res.status(200).json({
    success: true,
    data: transfer,
    message: 'Transfer accepted successfully'
  });
});

// @desc    Reject branch transfer
// @route   PATCH /api/branch-transfers/:id/reject
// @access  Branch Admin
exports.rejectBranchTransfer = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  
  const transfer = await BranchTransfer.findById(req.params.id);
  
  if (!transfer) {
    return next(new AppError('Transfer not found', 404));
  }
  
  if (transfer.status !== 'PENDING') {
    return next(new AppError('Transfer already processed', 400));
  }
  
  const userBranchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
  if (transfer.branchId.toString() !== userBranchId.toString()) {
    return next(new AppError('Not authorized for this branch', 403));
  }
  
  transfer.status = 'REJECTED';
  transfer.rejectedAt = new Date();
  transfer.rejectedBy = req.user._id;
  transfer.rejectReason = reason || 'Rejected by branch admin';
  await transfer.save();
  
  res.status(200).json({
    success: true,
    data: transfer,
    message: 'Transfer rejected'
  });
});

// @desc    Get branch transfer stats
// @route   GET /api/branch-transfers/stats
// @access  Super Admin, Branch Admin
exports.getBranchTransferStats = catchAsync(async (req, res, next) => {
  let matchQuery = {};
  
  if (req.user.role === 'branch_admin') {
    const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    matchQuery.branchId = branchId;
  }
  
  const stats = await BranchTransfer.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalQuantity: { $sum: '$totalQuantity' },
        totalCostValue: { $sum: '$totalCostValue' },
        totalTransferValue: { $sum: '$totalTransferValue' }
      }
    }
  ]);
  
  const pending = stats.find(s => s._id === 'PENDING') || { count: 0, totalQuantity: 0, totalCostValue: 0, totalTransferValue: 0 };
  const accepted = stats.find(s => s._id === 'ACCEPTED') || { count: 0, totalQuantity: 0, totalCostValue: 0, totalTransferValue: 0 };
  const rejected = stats.find(s => s._id === 'REJECTED') || { count: 0, totalQuantity: 0, totalCostValue: 0, totalTransferValue: 0 };
  
  res.status(200).json({
    success: true,
    data: {
      pending: pending.count,
      accepted: accepted.count,
      rejected: rejected.count,
      totalQuantity: accepted.totalQuantity,
      totalCostValue: accepted.totalCostValue,
      totalTransferValue: accepted.totalTransferValue
    }
  });
});