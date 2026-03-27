const Chemical = require('../models/Chemical');
const Inventory = require('../models/Inventory');
const InventoryTransaction = require('../models/InventoryTransaction');
const Branch = require('../models/Branch');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// @desc    Add a chemical (Admin only)
// @route   POST /api/inventory/chemicals
// @access  Private (Super Admin)
exports.addChemical = catchAsync(async (req, res, next) => {
  const { name, unit, description, mainStock } = req.body;
  const chemical = await Chemical.create({ name, unit, description, mainStock });
  
  // Record Transaction
  await InventoryTransaction.create({
    chemicalId: chemical._id,
    fromType: 'Admin',
    // No toType/toId for STOCK_ADD — stock is added to main central pool, no recipient
    quantity: mainStock,
    type: 'STOCK_ADD',
    notes: 'Initial stock add',
    performedBy: req.user._id
  });

  res.status(201).json({ success: true, data: chemical });
});

// @desc    Get all chemicals
// @route   GET /api/inventory/chemicals
// @access  Private
exports.getChemicals = catchAsync(async (req, res, next) => {
  const chemicals = await Chemical.find();
  res.status(200).json({ success: true, data: chemicals });
});

// @desc    Assign stock (Admin -> Branch OR Manager -> User)
// @route   POST /api/inventory/assign
// @access  Private (Admins)
exports.assignStock = catchAsync(async (req, res, next) => {
  const { chemicalId, targetId, targetType, quantity, notes } = req.body;

  if (quantity <= 0) return next(new AppError('Quantity must be greater than 0', 400));

  const chemical = await Chemical.findById(chemicalId);
  if (!chemical) return next(new AppError('Chemical not found', 404));

  // If Admin -> Branch
  if (req.user.role === 'super_admin' && targetType === 'Branch') {
    if (chemical.mainStock < quantity) return next(new AppError('Insufficient main stock', 400));
    
    // 1. Deduct from Main Stock
    chemical.mainStock -= quantity;
    await chemical.save();

    // 2. Add to Branch Inventory
    await Inventory.findOneAndUpdate(
      { chemicalId, ownerId: targetId, ownerType: 'Branch' },
      { $inc: { quantity: quantity } },
      { upsert: true, new: true }
    );

    // 3. Record Transaction
    await InventoryTransaction.create({
      chemicalId,
      fromId: req.user._id,
      fromType: 'Admin',
      toId: targetId,
      toType: 'Branch',
      quantity,
      type: 'ASSIGNED',
      notes: notes || `Admin assigned to branch.`,
      performedBy: req.user._id
    });
  } 

  // If Manager -> User
  else if ((req.user.role === 'branch_admin' || req.user.role === 'office') && targetType === 'User') {
    // 1. Check if Branch has enough stock
    const branchInv = await Inventory.findOne({ chemicalId, ownerId: req.user.branchId, ownerType: 'Branch' });
    if (!branchInv || branchInv.quantity < quantity) {
      return next(new AppError(`Insufficient branch stock. (Current: ${branchInv ? branchInv.quantity : 0})`, 400));
    }

    // 2. Deduct from Branch
    branchInv.quantity -= quantity;
    await branchInv.save();

    // 3. Add to User Inventory
    await Inventory.findOneAndUpdate(
      { chemicalId, ownerId: targetId, ownerType: 'User' },
      { $inc: { quantity: quantity } },
      { upsert: true, new: true }
    );

    // 4. Record Transaction
    await InventoryTransaction.create({
      chemicalId,
      fromId: req.user.branchId,
      fromType: 'Branch',
      toId: targetId,
      toType: 'User',
      quantity,
      type: 'ASSIGNED',
      notes: notes || `Manager assigned to user.`,
      performedBy: req.user._id
    });
  } 
  
  else {
    return next(new AppError('Unauthorized stock assignment or incorrect target type', 403));
  }

  res.status(200).json({ success: true, message: 'Stock assigned successfully' });
});

// @desc    Report usage (User reports using X quantity)
// @route   POST /api/inventory/usage
// @access  Private
exports.reportUsage = catchAsync(async (req, res, next) => {
  const { chemicalId, quantity, notes } = req.body;
  if (quantity <= 0) return next(new AppError('Quantity must be greater than 0', 400));

  const userInv = await Inventory.findOne({ chemicalId, ownerId: req.user._id, ownerType: 'User' });
  if (!userInv || userInv.quantity < quantity) {
    return next(new AppError('Insufficient personal stock reported', 400));
  }

  // 1. Deduct from User
  userInv.quantity -= quantity;
  await userInv.save();

  // 2. Record Transaction
  await InventoryTransaction.create({
    chemicalId,
    fromId: req.user._id,
    fromType: 'User',
    toType: 'Usage',
    quantity,
    type: 'USAGE',
    notes: notes || 'Chemical usage reported.',
    performedBy: req.user._id
  });

  res.status(200).json({ success: true, message: 'Usage reported successfully' });
});

// @desc    Get Inventory (Role-based)
// @route   GET /api/inventory
// @access  Private
exports.getInventory = catchAsync(async (req, res, next) => {
  let query = {};
  
  if (req.user.role === 'super_admin') {
    // Admin sees all branch/user inventories (optional, usually sees summary or branch aggregates)
    query = {};
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    // Branch admin sees their branch inventory + inventories of all users in their branch
    const usersInBranch = await User.find({ branchId: req.user.branchId }).select('_id');
    const userIds = usersInBranch.map(u => u._id);
    query = { 
      $or: [
        { ownerId: req.user.branchId, ownerType: 'Branch' },
        { ownerId: { $in: userIds }, ownerType: 'User' }
      ]
    };
  } else {
    // Regular user sees only their inventory
    query = { ownerId: req.user._id, ownerType: 'User' };
  }

  const inventory = await Inventory.find(query)
    .populate('chemicalId')
    .sort('-updatedAt');

  // Need to populate owner names if possible
  // This is a bit complex as owner can be Branch or User
  // We'll perform manual mapping for clarity
  const formatted = await Promise.all(inventory.map(async (item) => {
    let ownerName = 'Unknown';
    if (item.ownerType === 'Branch') {
      const branch = await Branch.findById(item.ownerId).select('branchName');
      ownerName = branch ? branch.branchName : 'Branch';
    } else {
      const user = await User.findById(item.ownerId).select('name');
      ownerName = user ? user.name : 'Employee';
    }
    return { ...item._doc, ownerName };
  }));

  res.status(200).json({ success: true, data: formatted });
});

// @desc    Get Inventory Transactions
// @route   GET /api/inventory/transactions
// @access  Private
exports.getTransactions = catchAsync(async (req, res, next) => {
  let query = {};
  
  if (req.user.role === 'super_admin') {
    query = {};
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    // Show all transfers involving branch or branch users
    const usersInBranch = await User.find({ branchId: req.user.branchId }).select('_id');
    const userIds = usersInBranch.map(u => u._id);
    query = { 
      $or: [
        { fromId: req.user.branchId },
        { toId: req.user.branchId },
        { performedBy: { $in: userIds } },
        { performedBy: req.user._id }
      ]
    };
  } else {
    // Only user's own transactions
    query = { $or: [{ fromId: req.user._id }, { toId: req.user._id }] };
  }

  const transactions = await InventoryTransaction.find(query)
    .populate('chemicalId')
    .populate('performedBy', 'name')
    .sort('-createdAt')
    .limit(50);

  // Manual populate for to/from names
  const results = await Promise.all(transactions.map(async (tx) => {
     let fromName = tx.fromType === 'Admin' ? 'Super Admin' : 'Unknown';
     let toName = tx.toType === 'Usage' ? 'Consumed' : 'Unknown';

     if (tx.fromId) {
       const u = await User.findById(tx.fromId);
       if (u) fromName = u.name;
       else {
         const b = await Branch.findById(tx.fromId);
         if (b) fromName = b.branchName;
       }
     }

     if (tx.toId) {
        const u = await User.findById(tx.toId);
        if (u) toName = u.name;
        else {
          const b = await Branch.findById(tx.toId);
          if (b) toName = b.branchName;
        }
     }

     return { ...tx._doc, fromName, toName };
  }));

  res.status(200).json({ success: true, data: results });
});

// @desc    Delete a chemical (Super Admin only)
// @route   DELETE /api/inventory/chemicals/:id
// @access  Private (Super Admin)
exports.deleteChemical = catchAsync(async (req, res, next) => {
  const chemical = await Chemical.findById(req.params.id);

  if (!chemical) {
    return next(new AppError('Chemical not found', 404));
  }

  // Check if chemical is in use
  const inventoryItems = await Inventory.find({ chemicalId: req.params.id });
  if (inventoryItems.length > 0) {
    return next(new AppError('Cannot delete chemical that is currently in use by branches or users', 400));
  }

  await Chemical.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Chemical purged successfully',
    data: null,
  });
});

// @desc    Delete an inventory allocation (Super Admin only)
// @route   DELETE /api/inventory/:id
// @access  Private (Super Admin)
exports.deleteInventory = catchAsync(async (req, res, next) => {
  const inventoryItem = await Inventory.findById(req.params.id);

  if (!inventoryItem) {
    return next(new AppError('Inventory allocation not found', 404));
  }

  await Inventory.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Inventory allocation purged successfully',
    data: null,
  });
});
