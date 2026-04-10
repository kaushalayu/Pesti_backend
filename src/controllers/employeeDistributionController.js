const Distribution = require('../models/Distribution');
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const InventoryTransaction = require('../models/InventoryTransaction');
const Chemical = require('../models/Chemical');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create distribution (Branch Admin gives to Employee)
// @route   POST /api/employee-distributions
// @access  Branch Admin, Office
exports.createDistribution = catchAsync(async (req, res, next) => {
  const { employeeId, items, notes, fromUserId } = req.body;
  
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
  
  // Check if this is a peer-to-peer request (employee to employee)
  const isPeerToPeer = fromUserId && (req.user.role === 'employee' || req.user.role === 'technician' || req.user.role === 'sales');
  
  let totalQty = 0;
  let totalValue = 0;
  const enrichedItems = [];
  
  for (const item of items) {
    let sourceInv;
    
    if (isPeerToPeer) {
      // Deduct from sender's inventory (peer-to-peer is immediate)
      sourceInv = await Inventory.findOne({
        chemicalId: item.chemicalId,
        ownerId: fromUserId,
        ownerType: 'Employee'
      });
      
      if (!sourceInv || sourceInv.quantity < item.quantity) {
        return next(new AppError(`Insufficient stock for ${item.chemicalId}`, 400));
      }
      
      sourceInv.quantity -= item.quantity;
      sourceInv.totalValue = Math.round(sourceInv.quantity * sourceInv.transferRate * 100) / 100;
      await sourceInv.save();
    } else {
      // Check branch inventory exists but DON'T deduct yet
      // Deduction will happen when technician accepts
      sourceInv = await Inventory.findOne({
        chemicalId: item.chemicalId,
        ownerId: branchId,
        ownerType: 'Branch'
      });
      
      if (!sourceInv || sourceInv.quantity < item.quantity) {
        return next(new AppError(`Insufficient stock for ${item.chemicalId}`, 400));
      }
      // Note: We don't deduct here, only check availability
    }
    
    const quantity = parseFloat(item.quantity) || 0;
    const bottles = parseFloat(item.bottles) || 0;
    const rate = sourceInv.transferRate || 0;
    const value = Math.round(quantity * rate * 100) / 100;
    
    // Get chemical name from Chemical collection
    const chemical = await Chemical.findById(item.chemicalId);
    const chemicalName = chemical?.name || item.chemicalName || 'Unknown';
    const category = chemical?.category || '';
    
    totalQty += quantity;
    totalValue += value;
    
    enrichedItems.push({
      chemicalId: item.chemicalId,
      chemicalName: chemicalName,
      category: category,
      quantity: quantity,
      unit: item.unit || sourceInv.unit || 'L',
      bottles: bottles,
      rate: rate,
      value: value
    });
  }
  
  // For branch admin -> employee distribution, always set to PENDING (technician must accept)
  const distribution = await Distribution.create({
    branchId,
    fromUserId: isPeerToPeer ? fromUserId : null,
    employeeId,
    items: enrichedItems,
    totalQuantity: totalQty,
    totalValue: totalValue,
    notes: notes || '',
    distributedBy: req.user._id,
    status: 'PENDING', // Always PENDING - technician must accept
    distributedAt: null // Will be set when technician accepts
  });
  
  // Create pending transaction for visibility
  for (const item of enrichedItems) {
    await InventoryTransaction.create({
      txnType: 'DISTRIBUTE_TO_EMPLOYEE',
      chemicalId: item.chemicalId,
      fromId: branchId,
      fromType: 'Branch',
      toId: employeeId,
      toType: 'Employee',
      quantity: item.quantity,
      bottles: item.bottles || 0,
      unit: item.unit,
      unitPrice: item.rate,
      totalValue: item.value,
      type: 'DISTRIBUTE_PENDING',
      notes: `Pending - Awaiting ${employee.name} acceptance`,
      performedBy: req.user._id
    });
  }
  
  await distribution.populate('employeeId', 'name employeeId');
  await distribution.populate('fromUserId', 'name');
  
  res.status(201).json({
    success: true,
    data: distribution
  });
});

// @desc    Approve distribution request (Employee accepts)
// @route   POST /api/employee-distributions/:id/approve
// @access  Employee
exports.approveDistribution = catchAsync(async (req, res, next) => {
  const distribution = await Distribution.findById(req.params.id);
  
  if (!distribution) {
    return next(new AppError('Distribution not found', 404));
  }
  
  if (distribution.employeeId.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized', 403));
  }
  
  if (distribution.status !== 'PENDING') {
    return next(new AppError('Distribution is not pending', 400));
  }
  
  const branchId = distribution.branchId;
  
  // Deduct from branch inventory (including bottles)
  for (const item of distribution.items) {
    const branchInv = await Inventory.findOne({
      chemicalId: item.chemicalId,
      ownerId: branchId,
      ownerType: 'Branch'
    });
    
    if (!branchInv || branchInv.quantity < item.quantity) {
      return next(new AppError(`Insufficient stock for ${item.chemicalName}`, 400));
    }
    
    branchInv.quantity -= item.quantity;
    if (item.bottles > 0) {
      branchInv.bottles = Math.max(0, (branchInv.bottles || 0) - item.bottles);
    }
    branchInv.totalValue = Math.round(branchInv.quantity * branchInv.transferRate * 100) / 100;
    await branchInv.save();
  }
  
  // Create inventory for employee
  for (const item of distribution.items) {
    let empInv = await Inventory.findOne({
      chemicalId: item.chemicalId,
      ownerId: distribution.employeeId,
      ownerType: 'Employee'
    });
    
    if (empInv) {
      empInv.quantity += item.quantity;
      empInv.bottles = (empInv.bottles || 0) + (item.bottles || 0);
      empInv.totalValue = Math.round(empInv.quantity * item.rate * 100) / 100;
      await empInv.save();
    } else {
      const chem = await require('../models/Chemical').findById(item.chemicalId);
      empInv = await Inventory.create({
        chemicalId: item.chemicalId,
        ownerId: distribution.employeeId,
        ownerType: 'Employee',
        quantity: item.quantity,
        unit: item.unit,
        displayQuantity: item.quantity,
        displayUnit: item.unit,
        bottles: item.bottles || 0,
        bottleSize: chem?.bottleSize || 1,
        transferRate: item.rate,
        totalValue: item.value,
        unitSystem: chem?.unitSystem || 'L'
      });
    }
  }
  
  // Create transactions
  for (const item of distribution.items) {
    await InventoryTransaction.create({
      txnType: 'DISTRIBUTE_TO_EMPLOYEE',
      chemicalId: item.chemicalId,
      fromId: branchId,
      fromType: 'Branch',
      toId: distribution.employeeId,
      toType: 'Employee',
      quantity: item.quantity,
      bottles: item.bottles || 0,
      unit: item.unit,
      unitPrice: item.rate,
      totalValue: item.value,
      type: 'DISTRIBUTE',
      notes: `Approved and distributed to ${req.user.name}`,
      performedBy: req.user._id
    });
  }
  
  distribution.status = 'APPROVED';
  distribution.distributedAt = new Date();
  await distribution.save();
  
  res.status(200).json({
    success: true,
    message: 'Stock accepted and added to your wallet',
    data: distribution
  });
});

// @desc    Reject distribution request
// @route   POST /api/employee-distributions/:id/reject
// @access  Employee
exports.rejectDistribution = catchAsync(async (req, res, next) => {
  const distribution = await Distribution.findById(req.params.id);
  
  if (!distribution) {
    return next(new AppError('Distribution not found', 404));
  }
  
  if (distribution.employeeId.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized', 403));
  }
  
  if (distribution.status !== 'PENDING') {
    return next(new AppError('Distribution is not pending', 400));
  }
  
  distribution.status = 'REJECTED';
  await distribution.save();
  
  res.status(200).json({
    success: true,
    message: 'Distribution rejected',
    data: distribution
  });
});

// @desc    Get all distributions (Super Admin sees all, Branch Admin sees own)
// @route   GET /api/employee-distributions
// @access  Super Admin, Branch Admin
exports.getDistributions = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, employeeId, startDate, endDate, branchId } = req.query;
  
  let query = {};
  
  // Super Admin sees all distributions (can filter by branchId)
  if (req.user.role === 'super_admin') {
    if (branchId) query.branchId = branchId;
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const userBranchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    query.branchId = userBranchId;
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