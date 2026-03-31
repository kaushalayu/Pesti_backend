const Payment = require('../models/Payment');
const Branch = require('../models/Branch');
const Receipt = require('../models/Receipt');
const InventoryTransaction = require('../models/InventoryTransaction');
const HQAccount = require('../models/HQAccount');
const BranchLedger = require('../models/BranchLedger');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

exports.addPayment = catchAsync(async (req, res, next) => {
  const { branchId, amount, paymentMethod, transactionId, notes, paidAt } = req.body;

  if (parseFloat(amount) <= 0) {
    return next(new AppError('Amount must be greater than 0', 400));
  }

  const branch = await Branch.findById(branchId);
  if (!branch) return next(new AppError('Branch not found', 404));

  const paymentAmount = parseFloat(amount);
  const balanceAfter = Math.max(0, branch.pendingBalance - paymentAmount);

  const payment = await Payment.create({
    branchId,
    amount: paymentAmount,
    paymentMethod,
    transactionId,
    notes,
    paidAt: paidAt || Date.now(),
    recordedBy: req.user._id,
    balanceAfter
  });

  branch.totalPaid += paymentAmount;
  branch.pendingBalance = Math.max(0, branch.pendingBalance - paymentAmount);
  await branch.save();

  await InventoryTransaction.create({
    txnType: 'STOCK_ADJUSTMENT',
    fromId: branchId,
    fromType: 'Branch',
    toType: 'Usage',
    quantity: 0,
    type: 'PAYMENT',
    notes: `Payment received: ₹${paymentAmount} via ${paymentMethod}${transactionId ? ` (${transactionId})` : ''}${notes ? ` - ${notes}` : ''}`,
    performedBy: req.user._id
  });

  // Record in HQ Account - Branch Stock Payment
  await HQAccount.create({
    type: 'INCOME',
    source: 'BRANCH_STOCK_PAYMENT',
    amount: paymentAmount,
    balanceAfter: 0,
    relatedId: payment._id,
    relatedModel: 'Payment',
    branchId,
    description: `Branch "${branch.branchName}" paid for stock (${notes || paymentMethod})`,
    paymentMode: paymentMethod,
    transactionRef: transactionId,
    performedBy: req.user._id,
    date: paidAt || new Date()
  });

  // Record in Branch Ledger - Debit (Payment to HQ)
  const branchBalance = await BranchLedger.getBranchBalance(branchId);
  await BranchLedger.create({
    branchId,
    type: 'DEBIT',
    category: 'BRANCH_PAYMENT_TO_HQ',
    amount: paymentAmount,
    balanceAfter: branchBalance.balance - paymentAmount,
    relatedId: payment._id,
    relatedModel: 'Payment',
    description: `Payment to HQ for stock: ${notes || paymentMethod}`,
    paymentMode: paymentMethod,
    transactionRef: transactionId,
    performedBy: req.user._id,
    date: paidAt || new Date()
  });

  res.status(201).json({ 
    success: true, 
    data: payment,
    message: `Payment of ₹${paymentAmount} recorded successfully`
  });
});

exports.getPayments = catchAsync(async (req, res, next) => {
  let query = {};

  if (req.user.role === 'super_admin') {
    if (req.query.branchId) {
      query.branchId = req.query.branchId;
    }
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    query.branchId = req.user.branchId;
  } else {
    return next(new AppError('Unauthorized', 403));
  }

  const payments = await Payment.find(query)
    .populate('branchId', 'branchName branchCode')
    .populate('recordedBy', 'name')
    .sort('-createdAt')
    .limit(100);

  res.status(200).json({ success: true, data: payments });
});

exports.getBranchHQSummary = catchAsync(async (req, res, next) => {
  let branchId;
  
  if (req.user.role === 'super_admin') {
    branchId = req.query.branchId;
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
  } else {
    return next(new AppError('Unauthorized', 403));
  }

  if (req.user.role === 'super_admin' && !branchId) {
    const branches = await Branch.find({ isActive: true }).sort('branchName');
    const branchSummaries = await Promise.all(branches.map(async (branch) => {
      const pendingRevenueResult = await Receipt.aggregate([
        { $match: { branchId: branch._id, status: { $in: ['PENDING', 'PARTIAL'] } } },
        { $group: { _id: null, totalDue: { $sum: '$balanceDue' } } }
      ]);
      const inventoryResult = await InventoryTransaction.aggregate([
        { $match: { toId: branch._id, txnType: 'TRANSFER_TO_BRANCH' } },
        { $group: { _id: null, totalValue: { $sum: '$totalValue' } } }
      ]);
      return {
        branchId: branch._id,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        totalReceivedFromHQ: branch.totalReceivedValue,
        totalPaidToHQ: branch.totalPaid,
        pendingBalance: branch.pendingBalance,
        pendingFromCustomers: pendingRevenueResult.length ? pendingRevenueResult[0].totalDue : 0,
        totalInventoryValue: inventoryResult.length ? inventoryResult[0].totalValue : 0,
      };
    }));

    const totals = branchSummaries.reduce((acc, b) => ({
      totalReceivedFromHQ: acc.totalReceivedFromHQ + b.totalReceivedFromHQ,
      totalPaidToHQ: acc.totalPaidToHQ + b.totalPaidToHQ,
      pendingBalance: acc.pendingBalance + b.pendingBalance,
      pendingFromCustomers: acc.pendingFromCustomers + b.pendingFromCustomers,
      totalInventoryValue: acc.totalInventoryValue + (b.totalInventoryValue || 0),
    }), { totalReceivedFromHQ: 0, totalPaidToHQ: 0, pendingBalance: 0, pendingFromCustomers: 0, totalInventoryValue: 0 });

    return res.status(200).json({ 
      success: true, 
      data: {
        branches: branchSummaries,
        totals
      }
    });
  }

  if (!branchId) {
    return next(new AppError('Branch ID is required', 400));
  }

  const branch = await Branch.findById(branchId);
  if (!branch) return next(new AppError('Branch not found', 404));

  const payments = await Payment.find({ branchId }).sort('-createdAt').limit(20);

  const pendingRevenueResult = await Receipt.aggregate([
    { $match: { branchId: branch._id, status: { $in: ['PENDING', 'PARTIAL'] } } },
    { $group: { _id: null, totalDue: { $sum: '$balanceDue' } } }
  ]);
  const pendingFromCustomers = pendingRevenueResult.length ? pendingRevenueResult[0].totalDue : 0;

  const inventoryReceived = await InventoryTransaction.aggregate([
    { $match: { toId: branch._id, txnType: 'TRANSFER_TO_BRANCH' } },
    {
      $lookup: {
        from: 'chemicals',
        localField: 'chemicalId',
        foreignField: '_id',
        as: 'chemical'
      }
    },
    { $unwind: { path: '$chemical', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$chemicalId',
        chemicalName: { $first: '$chemical.name' },
        totalQuantity: { $sum: '$quantity' },
        totalValue: { $sum: '$totalValue' }
      }
    }
  ]);

  const totalInventoryValue = inventoryReceived.reduce((sum, item) => sum + (item.totalValue || 0), 0);

  res.status(200).json({ 
    success: true, 
    data: {
      branchId: branch._id,
      branchName: branch.branchName,
      branchCode: branch.branchCode,
      totalReceivedFromHQ: branch.totalReceivedValue,
      totalPaidToHQ: branch.totalPaid,
      pendingBalance: branch.pendingBalance,
      pendingFromCustomers,
      totalInventoryValue,
      inventoryReceived,
      recentPayments: payments
    }
  });
});

exports.getPaymentSummary = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return next(new AppError('Only Super Admin can view summary', 403));
  }

  const branches = await Branch.find({ isActive: true });
  
  const summary = await Promise.all(branches.map(async (branch) => {
    const payments = await Payment.find({ branchId: branch._id });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    return {
      branchId: branch._id,
      branchName: branch.branchName,
      branchCode: branch.branchCode,
      totalValue: branch.totalReceivedValue,
      totalPaid,
      pendingBalance: branch.pendingBalance,
      paymentCount: payments.length
    };
  }));

  const totals = summary.reduce((acc, b) => ({
    totalValue: acc.totalValue + b.totalValue,
    totalPaid: acc.totalPaid + b.totalPaid,
    pendingBalance: acc.pendingBalance + b.pendingBalance
  }), { totalValue: 0, totalPaid: 0, pendingBalance: 0 });

  res.status(200).json({ 
    success: true, 
    data: { 
      branches: summary,
      totals
    }
  });
});

exports.deletePayment = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return next(new AppError('Only Super Admin can delete payments', 403));
  }

  const payment = await Payment.findById(req.params.id);
  if (!payment) return next(new AppError('Payment not found', 404));

  const branch = await Branch.findById(payment.branchId);
  if (branch) {
    branch.totalPaid -= payment.amount;
    branch.pendingBalance += payment.amount;
    await branch.save();
  }

  await Payment.findByIdAndDelete(req.params.id);

  res.status(200).json({ success: true, message: 'Payment deleted successfully' });
});
