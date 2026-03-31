const Distribution = require('../models/Distribution');
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const InventoryTransaction = require('../models/InventoryTransaction');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create distribution (Branch Admin gives to Employee)
// @route   POST /api/employee-distributions
// @access  Branch Admin, Office
exports.createDistribution = catchAsync(async (req, res, next) => {
  const { employeeId, items, notes } = req.body;
  
  if (!employeeId) {
    return next(new AppError('Employee is required', 400));
  }
  
  if (!items || items.length === 0) {
    return next(new AppError('At least one item is required', 400));
  }
  
  const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
  const employee = await User.findById(employeeId);
  
  if (!employee || employee.branchId.toString() !== branchId.toString()) {
    return next(new AppError('Employee not found in your branch', 404));
  }
  
  let totalQty = 0;
  let totalValue = 0;
  const enrichedItems = [];
  
  for (const item of items) {
    // Get from branch inventory
    const branchInv = await Inventory.findOne({
      chemicalId: item.chemicalId,
      ownerId: branchId,
      ownerType: 'Branch'
    });
    
    if (!branchInv || branchInv.quantity < item.quantity) {
      return next(new AppError(`Insufficient stock for ${item.chemicalId}`, 400));
    }
    
    const quantity = parseFloat(item.quantity) || 0;
    const rate = branchInv.transferRate || 0;
    const value = Math.round(quantity * rate * 100) / 100;
    
    totalQty += quantity;
    totalValue += value;
    
    enrichedItems.push({
      chemicalId: item.chemicalId,
      chemicalName: branchInv.chemicalId?.name || item.chemicalName || 'Unknown',
      category: branchInv.chemicalId?.category || '',
      quantity: quantity,
      unit: item.unit || branchInv.unit || 'L',
      rate: rate,
      value: value
    });
    
    // Deduct from branch inventory
    branchInv.quantity -= quantity;
    branchInv.totalValue = Math.round(branchInv.quantity * branchInv.transferRate * 100) / 100;
    await branchInv.save();
  }
  
  const distribution = await Distribution.create({
    branchId,
    employeeId,
    items: enrichedItems,
    totalQuantity: totalQty,
    totalValue: totalValue,
    notes: notes || '',
    distributedBy: req.user._id,
    status: 'DISTRIBUTED'
  });
  
  // Create transactions
  for (const item of enrichedItems) {
    await InventoryTransaction.create({
      txnType: 'DISTRIBUTE_TO_EMPLOYEE',
      chemicalId: item.chemicalId,
      fromId: branchId,
      fromType: 'Branch',
      toId: employeeId,
      toType: 'Employee',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.rate,
      totalValue: item.value,
      type: 'DISTRIBUTE',
      notes: `Distributed to ${employee.name}`,
      performedBy: req.user._id
    });
  }
  
  await distribution.populate('employeeId', 'name employeeId');
  
  res.status(201).json({
    success: true,
    data: distribution
  });
});

// @desc    Get all distributions (Super Admin sees all, Branch Admin sees own)
// @route   GET /api/employee-distributions
// @access  Super Admin, Branch Admin
exports.getDistributions = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, employeeId, startDate, endDate } = req.query;
  
  let query = {};
  
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    query.branchId = branchId;
  }
  
  if (employeeId) query.employeeId = employeeId;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const skip = (page - 1) * limit;
  
  const distributions = await Distribution.find(query)
    .populate('branchId', 'branchName')
    .populate('employeeId', 'name employeeId')
    .populate('distributedBy', 'name')
    .sort('-createdAt')
    .skip(skip)
    .limit(parseInt(limit));
  
  const total = await Distribution.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: distributions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get my distributions (Employee sees their own)
// @route   GET /api/employee-distributions/my-distributions
// @access  Employee
exports.getMyDistributions = catchAsync(async (req, res, next) => {
  const distributions = await Distribution.find({ employeeId: req.user._id })
    .populate('branchId', 'branchName')
    .populate('distributedBy', 'name')
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    data: distributions
  });
});

// @desc    Update distribution status
// @route   PATCH /api/employee-distributions/:id/status
// @access  Branch Admin
exports.updateDistribution = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  
  const distribution = await Distribution.findById(req.params.id);
  
  if (!distribution) {
    return next(new AppError('Distribution not found', 404));
  }
  
  // Verify branch authorization
  const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
  if (distribution.branchId.toString() !== branchId.toString()) {
    return next(new AppError('Not authorized', 403));
  }
  
  distribution.status = status;
  await distribution.save();
  
  res.status(200).json({
    success: true,
    data: distribution
  });
});

// @desc    Get distribution stats
// @route   GET /api/employee-distributions/stats
// @access  Branch Admin
exports.getDistributionStats = catchAsync(async (req, res, next) => {
  const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
  
  const stats = await Distribution.aggregate([
    { $match: { branchId: require('mongoose').Types.ObjectId.createFromHexString(branchId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalQuantity: { $sum: '$totalQuantity' },
        totalValue: { $sum: '$totalValue' }
      }
    }
  ]);
  
  const total = stats.reduce((sum, s) => sum + s.totalValue, 0);
  
  res.status(200).json({
    success: true,
    data: {
      totalDistributions: stats.reduce((sum, s) => sum + s.count, 0),
      totalValue: total,
      byStatus: stats
    }
  });
});

// @desc    Employee returns unused stock
// @route   POST /api/employee-distributions/return
// @access  Employee
exports.returnStock = catchAsync(async (req, res, next) => {
  const { distributionId, items } = req.body;
  
  if (!distributionId || !items || items.length === 0) {
    return next(new AppError('Distribution ID and items required', 400));
  }
  
  const distribution = await Distribution.findById(distributionId);
  if (!distribution) {
    return next(new AppError('Distribution not found', 404));
  }
  
  // Verify the employee is the one who received
  if (distribution.employeeId.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized', 403));
  }
  
  const branchId = distribution.branchId;
  
  // Add returned items back to branch inventory
  for (const item of items) {
    const quantity = parseFloat(item.quantity) || 0;
    if (quantity <= 0) continue;
    
    // Find the original item in distribution
    const originalItem = distribution.items.find(i => i.chemicalId.toString() === item.chemicalId);
    if (!originalItem) continue;
    
    const returnQty = Math.min(quantity, originalItem.quantity - (originalItem.returnedQty || 0));
    if (returnQty <= 0) continue;
    
    // Update returned qty in distribution
    originalItem.returnedQty = (originalItem.returnedQty || 0) + returnQty;
    
    // Add back to branch inventory
    let branchInv = await Inventory.findOne({
      chemicalId: item.chemicalId,
      ownerId: branchId,
      ownerType: 'Branch'
    });
    
    if (branchInv) {
      branchInv.quantity += returnQty;
      branchInv.totalValue = Math.round(branchInv.quantity * branchInv.transferRate * 100) / 100;
      await branchInv.save();
    }
    
    // Create return transaction
    await InventoryTransaction.create({
      txnType: 'RETURN_FROM_EMPLOYEE',
      chemicalId: item.chemicalId,
      fromId: req.user._id,
      fromType: 'Employee',
      toId: branchId,
      toType: 'Branch',
      quantity: returnQty,
      unit: item.unit || 'L',
      unitPrice: originalItem.rate,
      totalValue: Math.round(returnQty * originalItem.rate * 100) / 100,
      type: 'RETURN',
      notes: `Return from ${req.user.name}`,
      performedBy: req.user._id
    });
  }
  
  distribution.status = 'PARTIALLY_RETURNED';
  await distribution.save();
  
  await distribution.populate('employeeId', 'name employeeId');
  
  res.status(200).json({
    success: true,
    data: distribution,
    message: 'Stock returned successfully'
  });
});