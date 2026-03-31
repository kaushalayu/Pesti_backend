const PurchaseRequest = require('../models/PurchaseRequest');
const Chemical = require('../models/Chemical');
const Inventory = require('../models/Inventory');
const Branch = require('../models/Branch');
const InventoryTransaction = require('../models/InventoryTransaction');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create a new purchase request
// @route   POST /api/purchase-requests
// @access  Private (Branch Admin)
exports.createRequest = catchAsync(async (req, res, next) => {
  const { items, notes } = req.body;
  
  if (!items || items.length === 0) {
    return next(new AppError('At least one item is required', 400));
  }
  
  // Get branch ID
  let branchId;
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
  } else {
    return next(new AppError('Only Branch Admin can create purchase requests', 403));
  }
  
  // Calculate total value
  let totalValue = 0;
  const enrichedItems = [];
  
  for (const item of items) {
    const chemical = await Chemical.findById(item.chemicalId);
    if (!chemical) {
      return next(new AppError(`Chemical not found: ${item.chemicalId}`, 404));
    }
    
    const quantity = parseFloat(item.quantity) || 0;
    const rate = chemical.branchPrice || Math.round(chemical.purchasePrice * 1.10 * 100) / 100;
    const itemValue = Math.round(quantity * rate * 100) / 100;
    
    totalValue += itemValue;
    enrichedItems.push({
      chemicalId: item.chemicalId,
      quantity: quantity,
      unit: item.unit || chemical.unitSystem || 'L',
      rate: rate,
      itemValue: itemValue
    });
  }
  
  const request = await PurchaseRequest.create({
    branchId,
    requestedBy: req.user._id,
    items: enrichedItems,
    totalValue: totalValue,
    notes: notes || ''
  });
  
  res.status(201).json({
    success: true,
    data: request
  });
});

// @desc    Get all purchase requests (Super Admin)
// @route   GET /api/purchase-requests
// @access  Private
exports.getRequests = catchAsync(async (req, res, next) => {
  let matchStage = {};
  
  if (req.user.role === 'super_admin') {
    // Super Admin sees all requests
    matchStage = {};
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    // Branch Admin sees only their branch's requests
    const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    matchStage = { branchId };
  } else {
    return next(new AppError('Not authorized', 403));
  }
  
  const requests = await PurchaseRequest.find(matchStage)
    .populate('branchId', 'branchName branchCode')
    .populate('requestedBy', 'name')
    .populate('items.chemicalId', 'name category')
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    data: requests
  });
});

// @desc    Get my requests (Branch Admin's own requests)
// @route   GET /api/purchase-requests/my-requests
// @access  Private (Branch Admin)
exports.getMyRequests = catchAsync(async (req, res, next) => {
  const requests = await PurchaseRequest.find({ requestedBy: req.user._id })
    .populate('items.chemicalId', 'name category')
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    data: requests
  });
});

// @desc    Update request status (Approve/Reject/Complete)
// @route   PATCH /api/purchase-requests/:id/status
// @access  Private
exports.updateRequest = catchAsync(async (req, res, next) => {
  const { status, adminNotes } = req.body;
  
  const allowedStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'];
  if (!allowedStatuses.includes(status)) {
    return next(new AppError('Invalid status', 400));
  }
  
  const request = await PurchaseRequest.findById(req.params.id);
  if (!request) {
    return next(new AppError('Request not found', 404));
  }
  
  // Only Super Admin can approve/reject
  if ((status === 'APPROVED' || status === 'REJECTED') && req.user.role !== 'super_admin') {
    return next(new AppError('Only Super Admin can approve/reject requests', 403));
  }
  
  // Update status
  request.status = status;
  if (adminNotes) request.adminNotes = adminNotes;
  
  if (status === 'APPROVED') {
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();
    
    // Transfer chemicals to branch
    for (const item of request.items) {
      // Deduct from HQ stock
      const chemical = await Chemical.findById(item.chemicalId);
      if (chemical.mainStock < item.quantity) {
        return next(new AppError(`Insufficient stock for ${chemical.name}. Available: ${chemical.mainStock}`, 400));
      }
      
      chemical.mainStock -= item.quantity;
      await chemical.save();
      
      // Add to branch inventory
      let branchInv = await Inventory.findOne({ 
        chemicalId: item.chemicalId, 
        ownerId: request.branchId, 
        ownerType: 'Branch' 
      });
      
      if (branchInv) {
        branchInv.quantity += item.quantity;
        branchInv.totalValue = Math.round(branchInv.quantity * branchInv.transferRate * 100) / 100;
        await branchInv.save();
      } else {
        await Inventory.create({
          chemicalId: item.chemicalId,
          ownerId: request.branchId,
          ownerType: 'Branch',
          quantity: item.quantity,
          unit: item.unit,
          transferRate: item.rate,
          unitPrice: item.rate,
          totalValue: item.itemValue,
          originalQuantity: item.quantity,
          purchaseRate: chemical.purchasePrice
        });
      }
      
      // Update branch pending balance
      const branch = await Branch.findById(request.branchId);
      branch.totalReceivedValue += item.itemValue;
      branch.pendingBalance += item.itemValue;
      await branch.save();
      
      // Create transaction record
      await InventoryTransaction.create({
        txnType: 'TRANSFER_TO_BRANCH',
        chemicalId: item.chemicalId,
        fromId: req.user._id,
        fromType: 'super_admin',
        toId: request.branchId,
        toType: 'Branch',
        quantity: item.quantity,
        unit: item.unit,
        purchaseRate: chemical.purchasePrice,
        transferRate: item.rate,
        unitPrice: item.rate,
        totalValue: item.itemValue,
        type: 'TRANSFER',
        notes: `Purchase Request: ${request.requestNo}`,
        performedBy: req.user._id
      });
    }
  }
  
  if (status === 'REJECTED') {
    request.rejectedAt = new Date();
  }
  
  if (status === 'COMPLETED') {
    request.completedAt = new Date();
  }
  
  await request.save();
  
  res.status(200).json({
    success: true,
    data: request
  });
});

// @desc    Delete a request (only if pending)
// @route   DELETE /api/purchase-requests/:id
// @access  Private
exports.deleteRequest = catchAsync(async (req, res, next) => {
  const request = await PurchaseRequest.findById(req.params.id);
  
  if (!request) {
    return next(new AppError('Request not found', 404));
  }
  
  if (request.status !== 'PENDING') {
    return next(new AppError('Can only delete pending requests', 400));
  }
  
  // Only the requester or super admin can delete
  if (request.requestedBy.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
    return next(new AppError('Not authorized to delete this request', 403));
  }
  
  await PurchaseRequest.findByIdAndDelete(req.params.id);
  
  res.status(200).json({
    success: true,
    message: 'Request deleted successfully'
  });
});
