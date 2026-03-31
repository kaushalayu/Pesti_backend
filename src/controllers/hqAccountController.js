const mongoose = require('mongoose');
const HQAccount = require('../models/HQAccount');
const Branch = require('../models/Branch');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

exports.getHQBalance = catchAsync(async (req, res, next) => {
  const balance = await HQAccount.getBalance();
  const bySource = await HQAccount.getSummaryBySource();

  res.status(200).json({
    success: true,
    data: {
      balance,
      bySource
    }
  });
});

exports.getDashboardSummary = catchAsync(async (req, res, next) => {
  const balance = await HQAccount.getBalance();
  const bySource = await HQAccount.getSummaryBySource();
  
  const branches = await Branch.find({ isActive: true });
  
  const branchSummaries = await Promise.all(
    branches.map(async (branch) => {
      const branchBalance = await HQAccount.getBalanceByBranch(branch._id);
      return {
        branchId: branch._id,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        ...branchBalance
      };
    })
  );

  const recentTransactions = await HQAccount.find()
    .populate('performedBy', 'name')
    .populate('branchId', 'branchName branchCode')
    .sort('-createdAt')
    .limit(10);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayIncome = await HQAccount.aggregate([
    { $match: { type: 'INCOME', date: { $gte: today } } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);

  const todayExpense = await HQAccount.aggregate([
    { $match: { type: 'EXPENSE', date: { $gte: today } } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const monthIncome = await HQAccount.aggregate([
    { $match: { type: 'INCOME', date: { $gte: thisMonth } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const monthExpense = await HQAccount.aggregate([
    { $match: { type: 'EXPENSE', date: { $gte: thisMonth } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      balance,
      bySource,
      branches: branchSummaries,
      recentTransactions,
      today: {
        income: todayIncome[0]?.total || 0,
        incomeCount: todayIncome[0]?.count || 0,
        expense: todayExpense[0]?.total || 0,
        expenseCount: todayExpense[0]?.count || 0
      },
      thisMonth: {
        income: monthIncome[0]?.total || 0,
        expense: monthExpense[0]?.total || 0
      }
    }
  });
});

exports.getTransactions = catchAsync(async (req, res, next) => {
  const { source, branchId, startDate, endDate, page = 1, limit = 50 } = req.query;
  
  const filter = {};
  
  if (source) filter.source = source;
  if (branchId) filter.branchId = branchId;
  
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total] = await Promise.all([
    HQAccount.find(filter)
      .populate('performedBy', 'name')
      .populate('branchId', 'branchName branchCode')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    HQAccount.countDocuments(filter)
  ]);

  res.status(200).json({
    success: true,
    data: transactions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

exports.getBranchLedger = catchAsync(async (req, res, next) => {
  const { branchId } = req.params;
  
  if (!branchId) return next(new AppError('Branch ID is required', 400));

  const branchBalance = await HQAccount.getBalanceByBranch(branchId);
  
  const transactions = await HQAccount.find({ branchId })
    .populate('performedBy', 'name')
    .sort('-createdAt')
    .limit(100);

  const byMonth = await HQAccount.aggregate([
    { $match: { branchId: new mongoose.Types.ObjectId(branchId) } },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
          source: '$source'
        },
        total: { $sum: '$amount' }
      }
    },
    { $sort: { '_id.year': -1, '_id.month': -1 } },
    { $limit: 24 }
  ]);

  res.status(200).json({
    success: true,
    data: {
      balance: branchBalance,
      transactions,
      byMonth
    }
  });
});

exports.recordOpeningBalance = catchAsync(async (req, res, next) => {
  const { amount, description, date } = req.body;

  if (!amount || amount <= 0) {
    return next(new AppError('Amount must be greater than 0', 400));
  }

  const currentBalance = await HQAccount.getBalance();
  const newBalance = currentBalance.balance + parseFloat(amount);

  const entry = await HQAccount.create({
    type: 'INCOME',
    source: 'OPENING_BALANCE',
    amount: parseFloat(amount),
    balanceAfter: newBalance,
    description: description || 'Opening Balance',
    performedBy: req.user._id,
    date: date ? new Date(date) : new Date()
  });

  res.status(201).json({
    success: true,
    data: entry,
    newBalance
  });
});

exports.recordAdjustment = catchAsync(async (req, res, next) => {
  const { type, amount, description } = req.body;

  if (!['INCOME', 'EXPENSE'].includes(type)) {
    return next(new AppError('Type must be INCOME or EXPENSE', 400));
  }

  if (!amount || amount <= 0) {
    return next(new AppError('Amount must be greater than 0', 400));
  }

  const currentBalance = await HQAccount.getBalance();
  const newBalance = type === 'INCOME' 
    ? currentBalance.balance + parseFloat(amount)
    : currentBalance.balance - parseFloat(amount);

  const entry = await HQAccount.create({
    type,
    source: 'ADJUSTMENT',
    amount: parseFloat(amount),
    balanceAfter: newBalance,
    description: description || 'Manual Adjustment',
    performedBy: req.user._id,
    date: new Date()
  });

  res.status(201).json({
    success: true,
    data: entry,
    newBalance
  });
});
