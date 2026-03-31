const EmployeeLedger = require('../models/EmployeeLedger');
const BranchLedger = require('../models/BranchLedger');
const HQAccount = require('../models/HQAccount');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

exports.getMyLedger = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { startDate, endDate, page = 1, limit = 50 } = req.query;
  
  const filter = { userId };
  
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total, summary] = await Promise.all([
    EmployeeLedger.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    EmployeeLedger.countDocuments(filter),
    EmployeeLedger.getUserSummary(userId)
  ]);

  res.status(200).json({
    success: true,
    data: {
      transactions,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

exports.getMyBalance = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const balance = await EmployeeLedger.getUserBalance(userId);

  res.status(200).json({
    success: true,
    data: balance
  });
});

exports.getBranchLedger = catchAsync(async (req, res, next) => {
  let branchId = req.params.branchId || req.query.branchId;
  const { startDate, endDate, page = 1, limit = 50 } = req.query;
  
  if (!branchId) {
    if (req.user.role === 'branch_admin' || req.user.role === 'office') {
      branchId = req.user.branchId?._id || req.user.branchId;
    } else {
      return next(new AppError('Branch ID is required', 400));
    }
  }

  const filter = { branchId };
  
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total, summary] = await Promise.all([
    BranchLedger.find(filter)
      .populate('employeeId', 'name')
      .populate('performedBy', 'name')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    BranchLedger.countDocuments(filter),
    BranchLedger.getBranchSummary(branchId)
  ]);

  res.status(200).json({
    success: true,
    data: {
      transactions,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

exports.getBranchBalance = catchAsync(async (req, res, next) => {
  let branchId = req.params.branchId || req.query.branchId;
  
  if (!branchId) {
    if (req.user.role === 'branch_admin' || req.user.role === 'office') {
      branchId = req.user.branchId?._id || req.user.branchId;
    } else {
      return next(new AppError('Branch ID is required', 400));
    }
  }

  const balance = await BranchLedger.getBranchBalance(branchId);

  res.status(200).json({
    success: true,
    data: balance
  });
});

exports.getHQAccount = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return next(new AppError('Only Super Admin can access HQ Account', 403));
  }

  const balance = await HQAccount.getBalance();
  const bySource = await HQAccount.getSummaryBySource();
  
  const recentTransactions = await HQAccount.find()
    .populate('performedBy', 'name')
    .populate('branchId', 'branchName branchCode')
    .sort('-createdAt')
    .limit(20);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [todayIncome, todayExpense] = await Promise.all([
    HQAccount.aggregate([
      { $match: { type: 'INCOME', date: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    HQAccount.aggregate([
      { $match: { type: 'EXPENSE', date: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);

  res.status(200).json({
    success: true,
    data: {
      balance,
      bySource,
      recentTransactions,
      today: {
        income: todayIncome[0]?.total || 0,
        expense: todayExpense[0]?.total || 0
      }
    }
  });
});

exports.getHQTransactions = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return next(new AppError('Only Super Admin can access HQ Account', 403));
  }

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

exports.recordOpeningBalance = catchAsync(async (req, res, next) => {
  const { amount, type, description, date, employeeId, branchId } = req.body;

  if (!amount || amount <= 0) {
    return next(new AppError('Amount must be greater than 0', 400));
  }

  const userId = req.user._id;

  if (type === 'EMPLOYEE') {
    if (!employeeId) {
      return next(new AppError('Employee ID is required', 400));
    }

    const currentBalance = await EmployeeLedger.getUserBalance(employeeId);
    const newBalance = currentBalance.balance + parseFloat(amount);

    const entry = await EmployeeLedger.create({
      userId: employeeId,
      branchId: req.user.branchId || branchId,
      type: 'CREDIT',
      category: 'OPENING_BALANCE',
      amount: parseFloat(amount),
      balanceAfter: newBalance,
      description: description || 'Opening Balance',
      performedBy: userId,
      date: date ? new Date(date) : new Date()
    });

    res.status(201).json({
      success: true,
      data: entry,
      newBalance
    });

  } else if (type === 'BRANCH') {
    if (!branchId) {
      return next(new AppError('Branch ID is required', 400));
    }

    const currentBalance = await BranchLedger.getBranchBalance(branchId);
    const newBalance = currentBalance.balance + parseFloat(amount);

    const entry = await BranchLedger.create({
      branchId,
      type: 'CREDIT',
      category: 'OPENING_BALANCE',
      amount: parseFloat(amount),
      balanceAfter: newBalance,
      description: description || 'Opening Balance',
      performedBy: userId,
      date: date ? new Date(date) : new Date()
    });

    res.status(201).json({
      success: true,
      data: entry,
      newBalance
    });

  } else if (type === 'HQ') {
    if (req.user.role !== 'super_admin') {
      return next(new AppError('Only Super Admin can set HQ opening balance', 403));
    }

    const currentBalance = await HQAccount.getBalance();
    const newBalance = currentBalance.balance + parseFloat(amount);

    const entry = await HQAccount.create({
      type: 'INCOME',
      source: 'OPENING_BALANCE',
      amount: parseFloat(amount),
      balanceAfter: newBalance,
      description: description || 'Opening Balance',
      performedBy: userId,
      date: date ? new Date(date) : new Date()
    });

    res.status(201).json({
      success: true,
      data: entry,
      newBalance
    });

  } else {
    return next(new AppError('Invalid type. Use EMPLOYEE, BRANCH, or HQ', 400));
  }
});
