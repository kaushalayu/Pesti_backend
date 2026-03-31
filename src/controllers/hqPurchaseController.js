const HQPurchase = require('../models/HQPurchase');
const Chemical = require('../models/Chemical');
const InventoryTransaction = require('../models/InventoryTransaction');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create new purchase (Super Admin buys from supplier)
// @route   POST /api/hq-purchases
// @access  Super Admin
exports.createPurchase = catchAsync(async (req, res, next) => {
  const { items, supplierName, supplierContact, invoiceNo, notes } = req.body;
  
  if (!items || items.length === 0) {
    return next(new AppError('At least one item is required', 400));
  }
  
  // Calculate totals
  let totalQuantity = 0;
  let totalAmount = 0;
  const enrichedItems = [];
  
  for (const item of items) {
    const chemical = await Chemical.findById(item.chemicalId);
    if (!chemical) {
      return next(new AppError(`Chemical not found: ${item.chemicalId}`, 404));
    }
    
    const quantity = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.rate) || 0;
    const amount = Math.round(quantity * rate * 100) / 100;
    
    totalQuantity += quantity;
    totalAmount += amount;
    
    enrichedItems.push({
      chemicalId: item.chemicalId,
      chemicalName: chemical.name,
      category: chemical.category,
      quantity: quantity,
      unit: item.unit || chemical.unitSystem || 'L',
      rate: rate,
      amount: amount
    });
  }
  
  const purchase = await HQPurchase.create({
    items: enrichedItems,
    supplierName: supplierName || 'Direct Purchase',
    supplierContact: supplierContact || '',
    invoiceNo: invoiceNo || '',
    notes: notes || '',
    totalQuantity,
    totalAmount,
    purchasedBy: req.user._id
  });
  
  // Add stock to HQ inventory
  for (const item of enrichedItems) {
    const chemical = await Chemical.findById(item.chemicalId);
    chemical.mainStock = (chemical.mainStock || 0) + item.quantity;
    await chemical.save();
    
    // Record transaction
    await InventoryTransaction.create({
      txnType: 'PURCHASE',
      chemicalId: item.chemicalId,
      fromId: null,
      fromType: 'supplier',
      toId: req.user._id,
      toType: 'super_admin',
      quantity: item.quantity,
      unit: item.unit,
      purchaseRate: item.rate,
      totalValue: item.amount,
      type: 'IN',
      notes: `HQ Purchase - Invoice: ${invoiceNo || 'N/A'}`,
      performedBy: req.user._id
    });
  }
  
  res.status(201).json({
    success: true,
    data: purchase
  });
});

// @desc    Get all purchases
// @route   GET /api/hq-purchases
// @access  Super Admin, Branch Admin
exports.getPurchases = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, startDate, endDate } = req.query;
  
  let query = {};
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const skip = (page - 1) * limit;
  
  const purchases = await HQPurchase.find(query)
    .populate('purchasedBy', 'name')
    .sort('-createdAt')
    .skip(skip)
    .limit(parseInt(limit));
  
  const total = await HQPurchase.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: purchases,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get single purchase
// @route   GET /api/hq-purchases/:id
// @access  Super Admin
exports.getPurchaseById = catchAsync(async (req, res, next) => {
  const purchase = await HQPurchase.findById(req.params.id)
    .populate('purchasedBy', 'name');
  
  if (!purchase) {
    return next(new AppError('Purchase not found', 404));
  }
  
  res.status(200).json({
    success: true,
    data: purchase
  });
});

// @desc    Update purchase
// @route   PUT /api/hq-purchases/:id
// @access  Super Admin
exports.updatePurchase = catchAsync(async (req, res, next) => {
  const purchase = await HQPurchase.findById(req.params.id);
  
  if (!purchase) {
    return next(new AppError('Purchase not found', 404));
  }
  
  const { supplierName, supplierContact, invoiceNo, notes } = req.body;
  
  if (supplierName) purchase.supplierName = supplierName;
  if (supplierContact) purchase.supplierContact = supplierContact;
  if (invoiceNo) purchase.invoiceNo = invoiceNo;
  if (notes !== undefined) purchase.notes = notes;
  
  await purchase.save();
  
  res.status(200).json({
    success: true,
    data: purchase
  });
});

// @desc    Delete purchase (only if no transfers made)
// @route   DELETE /api/hq-purchases/:id
// @access  Super Admin
exports.deletePurchase = catchAsync(async (req, res, next) => {
  const purchase = await HQPurchase.findById(req.params.id);
  
  if (!purchase) {
    return next(new AppError('Purchase not found', 404));
  }
  
  // Check if any items have been transferred
  const transferredItems = purchase.items.filter(item => item.transferredQty > 0);
  if (transferredItems.length > 0) {
    return next(new AppError('Cannot delete - some items have already been transferred', 400));
  }
  
  // Reverse the stock
  for (const item of purchase.items) {
    const chemical = await Chemical.findById(item.chemicalId);
    if (chemical) {
      chemical.mainStock = Math.max(0, chemical.mainStock - item.quantity);
      await chemical.save();
    }
  }
  
  await HQPurchase.findByIdAndDelete(req.params.id);
  
  res.status(200).json({
    success: true,
    message: 'Purchase deleted successfully'
  });
});