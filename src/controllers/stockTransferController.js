const StockTransferRequest = require('../models/StockTransferRequest');
const Chemical = require('../models/Chemical');
const Inventory = require('../models/Inventory');
const InventoryTransaction = require('../models/InventoryTransaction');
const Branch = require('../models/Branch');
const User = require('../models/User');
const BranchLedger = require('../models/BranchLedger');
const EmployeeLedger = require('../models/EmployeeLedger');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const convertToBaseUnit = (quantity, unit, chemicalUnit) => {
  const qty = parseFloat(quantity) || 0;
  if ((unit === 'ML' || unit === 'ml') && chemicalUnit === 'L') {
    return qty / 1000;
  }
  if ((unit === 'G' || unit === 'g') && chemicalUnit === 'KG') {
    return qty / 1000;
  }
  return qty;
};

exports.createTransferRequest = catchAsync(async (req, res, next) => {
  const { chemicalId, toId, toType, quantity, unit, notes } = req.body;

  const qty = parseFloat(quantity) || 0;
  if (qty <= 0) return next(new AppError('Quantity must be greater than 0', 400));

  const chemical = await Chemical.findById(chemicalId);
  if (!chemical) return next(new AppError('Chemical not found', 404));

  const baseQuantity = convertToBaseUnit(qty, unit || chemical.unitSystem, chemical.unitSystem);

  let txnType, fromId, fromType;

  if (req.user.role === 'super_admin') {
    if (toType !== 'Branch') {
      return next(new AppError('Super Admin can only transfer to Branch', 400));
    }

    if (chemical.mainStock < baseQuantity) {
      return next(new AppError(`Insufficient stock. Available: ${chemical.mainStock} ${chemical.unitSystem}`, 400));
    }

    txnType = 'SUPER_TO_BRANCH';
    fromId = req.user._id;
    fromType = 'super_admin';

  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    if (toType !== 'Employee') {
      return next(new AppError('Branch Admin can only transfer to Employees', 400));
    }

    const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    const branchInv = await Inventory.findOne({ chemicalId, ownerId: branchId, ownerType: 'Branch' });

    if (!branchInv || branchInv.quantity < baseQuantity) {
      return next(new AppError(`Insufficient stock. Available: ${branchInv ? branchInv.quantity : 0} ${chemical.unitSystem}`, 400));
    }

    txnType = 'BRANCH_TO_EMPLOYEE';
    fromId = branchId;
    fromType = 'Branch';

  } else {
    return next(new AppError('Only Super Admin or Branch Admin can create transfer requests', 403));
  }

  const transferRate = txnType === 'SUPER_TO_BRANCH' 
    ? (chemical.branchPrice || Math.round(chemical.purchasePrice * 1.10 * 100) / 100)
    : 0;

  const totalValue = Math.round(baseQuantity * transferRate * 100) / 100;

  const request = await StockTransferRequest.create({
    txnType,
    chemicalId,
    quantity: baseQuantity,
    unit: chemical.unitSystem,
    fromId,
    fromType,
    toId,
    toType,
    purchaseRate: chemical.purchasePrice,
    transferRate,
    totalValue,
    requestedBy: req.user._id,
    notes
  });

  res.status(201).json({
    success: true,
    message: 'Transfer request created. Awaiting approval.',
    data: request
  });
});

exports.getTransferRequests = catchAsync(async (req, res, next) => {
  let matchStage = {};

  if (req.user.role === 'super_admin') {
    matchStage = { txnType: 'SUPER_TO_BRANCH' };
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    matchStage = {
      $or: [
        { txnType: 'BRANCH_TO_EMPLOYEE', fromId: branchId },
        { toId: branchId, txnType: 'SUPER_TO_BRANCH' }
      ]
    };
  } else if (req.user.role === 'technician' || req.user.role === 'sales' || req.user.role === 'office_staff') {
    matchStage = { toId: req.user._id, txnType: 'BRANCH_TO_EMPLOYEE' };
  } else {
    matchStage = { requestedBy: req.user._id };
  }

  if (req.query.status) {
    matchStage.status = req.query.status;
  }
  if (req.query.txnType) {
    matchStage.txnType = req.query.txnType;
  }

  const requests = await StockTransferRequest.find(matchStage)
    .populate('chemicalId', 'name category unitSystem purchasePrice branchPrice')
    .populate('requestedBy', 'name email role')
    .populate('toId', 'name email role branchId')
    .populate('fromId', 'branchName branchCode')
    .populate('respondedBy', 'name email')
    .sort('-createdAt')
    .lean();

  const formatted = requests.map(req => ({
    _id: req._id,
    requestNo: req.requestNo,
    txnType: req.txnType,
    chemicalId: req.chemicalId,
    chemicalName: req.chemicalId?.name,
    quantity: req.quantity,
    unit: req.unit,
    purchaseRate: req.purchaseRate,
    transferRate: req.transferRate,
    totalValue: req.totalValue,
    fromId: req.fromId,
    fromType: req.fromType,
    fromName: req.fromType === 'super_admin' ? 'Super Admin (HQ)' : req.fromId?.branchName || 'Branch',
    toId: req.toId,
    toType: req.toType,
    toName: req.toId?.name || 'Unknown',
    status: req.status,
    requestedBy: req.requestedBy,
    requestedAt: req.requestedAt,
    respondedBy: req.respondedBy,
    respondedAt: req.respondedAt,
    notes: req.notes,
    rejectionReason: req.rejectionReason,
    isTransferred: req.isTransferred,
    createdAt: req.createdAt
  }));

  res.status(200).json({ success: true, data: formatted });
});

exports.approveTransferRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const request = await StockTransferRequest.findById(id);
  if (!request) return next(new AppError('Transfer request not found', 404));

  if (request.status !== 'PENDING') {
    return next(new AppError('Request is already processed', 400));
  }

  const chemical = await Chemical.findById(request.chemicalId);
  if (!chemical) return next(new AppError('Chemical not found', 404));

  const baseQuantity = request.quantity;

  if (request.txnType === 'SUPER_TO_BRANCH') {
    if (req.user.role !== 'branch_admin' && req.user.role !== 'office') {
      return next(new AppError('Only Branch Admin can approve this request', 403));
    }

    const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    if (request.toId.toString() !== branchId.toString()) {
      return next(new AppError('This request is not for your branch', 403));
    }

    if (chemical.mainStock < baseQuantity) {
      return next(new AppError('Insufficient stock at HQ', 400));
    }

    chemical.mainStock -= baseQuantity;
    await chemical.save();

    let branchInv = await Inventory.findOne({ chemicalId: request.chemicalId, ownerId: branchId, ownerType: 'Branch' });
    if (branchInv) {
      branchInv.quantity += baseQuantity;
      branchInv.totalValue = Math.round(branchInv.quantity * branchInv.transferRate * 100) / 100;
      branchInv.originalQuantity += baseQuantity;
      await branchInv.save();
    } else {
      branchInv = await Inventory.create({
        chemicalId: request.chemicalId,
        ownerId: branchId,
        ownerType: 'Branch',
        quantity: baseQuantity,
        unit: chemical.unitSystem,
        transferRate: request.transferRate,
        unitPrice: request.transferRate,
        totalValue: request.totalValue,
        originalQuantity: baseQuantity,
        purchaseRate: chemical.purchasePrice
      });
    }

    const branch = await Branch.findById(branchId);
    if (branch) {
      branch.totalReceivedValue += request.totalValue;
      branch.pendingBalance += request.totalValue;
      await branch.save();
    }

    await InventoryTransaction.create({
      txnType: 'TRANSFER_TO_BRANCH',
      chemicalId: request.chemicalId,
      fromId: request.requestedBy,
      fromType: 'super_admin',
      toId: branchId,
      toType: 'Branch',
      quantity: baseQuantity,
      unit: chemical.unitSystem,
      purchaseRate: chemical.purchasePrice,
      transferRate: request.transferRate,
      unitPrice: request.transferRate,
      totalValue: request.totalValue,
      type: 'TRANSFER',
      notes: `Transfer approved by Branch Admin. ${request.notes || ''}`,
      performedBy: req.user._id
    });

    // Branch Ledger - DEBIT (Stock Received, Branch owes HQ)
    const branchBalance = await BranchLedger.getBranchBalance(branchId);
    await BranchLedger.create({
      branchId: branchId,
      type: 'DEBIT',
      category: 'STOCK_RECEIVED',
      amount: request.totalValue,
      balanceAfter: branchBalance.balance - request.totalValue,
      relatedId: request._id,
      relatedModel: 'StockTransfer',
      employeeId: request.requestedBy,
      description: `Stock received from HQ: ${chemical.name} (${baseQuantity} ${chemical.unitSystem})`,
      performedBy: req.user._id,
      date: new Date()
    });

  } else if (request.txnType === 'BRANCH_TO_EMPLOYEE') {
    if (req.user._id.toString() !== request.toId.toString()) {
      return next(new AppError('Only the recipient can accept this request', 403));
    }

    const branchId = request.fromId;
    const branchInv = await Inventory.findOne({ chemicalId: request.chemicalId, ownerId: branchId, ownerType: 'Branch' });

    if (!branchInv || branchInv.quantity < baseQuantity) {
      return next(new AppError('Insufficient stock at branch', 400));
    }

    branchInv.quantity -= baseQuantity;
    await branchInv.save();

    let empInv = await Inventory.findOne({ chemicalId: request.chemicalId, ownerId: request.toId, ownerType: 'Employee' });
    if (empInv) {
      empInv.quantity += baseQuantity;
      empInv.totalValue = Math.round(empInv.quantity * empInv.transferRate * 100) / 100;
      empInv.originalQuantity += baseQuantity;
      await empInv.save();
    } else {
      empInv = await Inventory.create({
        chemicalId: request.chemicalId,
        ownerId: request.toId,
        ownerType: 'Employee',
        quantity: baseQuantity,
        unit: chemical.unitSystem,
        transferRate: 0,
        unitPrice: 0,
        totalValue: 0,
        originalQuantity: baseQuantity,
        purchaseRate: chemical.purchasePrice
      });
    }

    await InventoryTransaction.create({
      txnType: 'TRANSFER_TO_EMPLOYEE',
      chemicalId: request.chemicalId,
      fromId: branchId,
      fromType: 'Branch',
      toId: request.toId,
      toType: 'Employee',
      quantity: baseQuantity,
      unit: chemical.unitSystem,
      purchaseRate: chemical.purchasePrice,
      transferRate: 0,
      unitPrice: 0,
      totalValue: 0,
      type: 'ASSIGNED',
      notes: `Transfer accepted by Employee. ${request.notes || ''}`,
      performedBy: req.user._id
    });

    // Branch Ledger - DEBIT (Stock Distributed to Employee)
    const branchLedgerBalance = await BranchLedger.getBranchBalance(branchId);
    await BranchLedger.create({
      branchId: branchId,
      type: 'DEBIT',
      category: 'STOCK_DISTRIBUTED',
      amount: request.totalValue || 0,
      balanceAfter: branchLedgerBalance.balance - (request.totalValue || 0),
      relatedId: request._id,
      relatedModel: 'StockTransfer',
      employeeId: request.toId,
      description: `Stock distributed to employee: ${chemical.name} (${baseQuantity} ${chemical.unitSystem})`,
      performedBy: req.user._id,
      date: new Date()
    });

    // Employee Ledger - CREDIT (Stock Received FREE)
    const empBalance = await EmployeeLedger.getUserBalance(request.toId);
    await EmployeeLedger.create({
      userId: request.toId,
      branchId: branchId,
      type: 'CREDIT',
      category: 'STOCK_RECEIVED',
      amount: request.totalValue || 0,
      balanceAfter: empBalance.balance + (request.totalValue || 0),
      relatedId: request._id,
      relatedModel: 'StockTransfer',
      description: `Stock received from branch: ${chemical.name} (${baseQuantity} ${chemical.unitSystem})`,
      performedBy: req.user._id,
      date: new Date()
    });
  }

  request.status = 'APPROVED';
  request.respondedBy = req.user._id;
  request.respondedAt = new Date();
  request.isTransferred = true;
  request.transferredAt = new Date();
  await request.save();

  res.status(200).json({
    success: true,
    message: 'Transfer request approved and stock transferred successfully',
    data: request
  });
});

exports.rejectTransferRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  const request = await StockTransferRequest.findById(id);
  if (!request) return next(new AppError('Transfer request not found', 404));

  if (request.status !== 'PENDING') {
    return next(new AppError('Request is already processed', 400));
  }

  if (request.txnType === 'SUPER_TO_BRANCH') {
    if (req.user.role !== 'branch_admin' && req.user.role !== 'office') {
      return next(new AppError('Only Branch Admin can reject this request', 403));
    }
    const branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    if (request.toId.toString() !== branchId.toString()) {
      return next(new AppError('This request is not for your branch', 403));
    }
  } else if (request.txnType === 'BRANCH_TO_EMPLOYEE') {
    if (req.user._id.toString() !== request.toId.toString()) {
      return next(new AppError('Only the recipient can reject this request', 403));
    }
  }

  request.status = 'REJECTED';
  request.respondedBy = req.user._id;
  request.respondedAt = new Date();
  request.rejectionReason = reason || 'Request rejected';
  await request.save();

  res.status(200).json({
    success: true,
    message: 'Transfer request rejected',
    data: request
  });
});

exports.getMyTransferStats = catchAsync(async (req, res, next) => {
  let matchStage = {};
  let branchId;

  if (req.user.role === 'super_admin') {
    matchStage = { txnType: 'SUPER_TO_BRANCH' };
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    branchId = typeof req.user.branchId === 'object' ? req.user.branchId._id : req.user.branchId;
    matchStage = { toId: branchId, txnType: 'SUPER_TO_BRANCH' };
  } else {
    return next(new AppError('Only Admin roles can view transfer stats', 403));
  }

  const requests = await StockTransferRequest.find(matchStage);

  const pending = requests.filter(r => r.status === 'PENDING').length;
  const approved = requests.filter(r => r.status === 'APPROVED');
  const rejected = requests.filter(r => r.status === 'REJECTED').length;

  const totalTransferredValue = approved.reduce((sum, r) => sum + r.totalValue, 0);
  const totalQuantity = requests.reduce((sum, r) => sum + r.quantity, 0);

  let totalPaid = 0;
  let pendingBalance = 0;

  if (req.user.role === 'super_admin') {
    const branches = await Branch.find({ isActive: true });
    totalPaid = branches.reduce((sum, b) => sum + (b.totalPaid || 0), 0);
    pendingBalance = branches.reduce((sum, b) => sum + (b.pendingBalance || 0), 0);
  } else {
    const branch = await Branch.findById(branchId);
    if (branch) {
      totalPaid = branch.totalPaid || 0;
      pendingBalance = branch.pendingBalance || 0;
    }
  }

  res.status(200).json({
    success: true,
    data: {
      totalRequests: requests.length,
      pending,
      approved: approved.length,
      rejected,
      totalQuantity,
      totalTransferredValue,
      totalPaid,
      pendingBalance
    }
  });
});
