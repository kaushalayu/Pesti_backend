const Expense = require('../models/Expense');
const Notification = require('../models/Notification');
const HQAccount = require('../models/HQAccount');
const EmployeeLedger = require('../models/EmployeeLedger');
const BranchLedger = require('../models/BranchLedger');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const emailQueue = require('../jobs/emailQueue');

const sendExpenseNotification = async (expense, status, rejectionReason = null) => {
  const notificationData = {
    userId: expense.employeeId,
    relatedId: expense._id,
    relatedType: 'Expense',
    data: {
      amount: expense.amount,
      category: expense.category,
      status,
      rejectionReason,
    },
  };

  if (status === 'APPROVED') {
    notificationData.type = 'EXPENSE_APPROVED';
    notificationData.title = 'Expense Approved!';
    notificationData.message = `Your expense of ₹${expense.amount} for ${expense.category} has been approved.`;
  } else if (status === 'REJECTED') {
    notificationData.type = 'EXPENSE_REJECTED';
    notificationData.title = 'Expense Rejected';
    notificationData.message = `Your expense of ₹${expense.amount} for ${expense.category} has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;
  }

  await Notification.create(notificationData);

  try {
    await emailQueue.add({
      type: status === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
      data: {
        expenseId: expense._id.toString(),
        employeeId: expense.employeeId.toString(),
        status,
        rejectionReason,
      },
    });
  } catch (error) {
    console.warn('Email notification failed:', error.message);
  }
};

exports.createExpense = catchAsync(async (req, res, next) => {
  const expensePayload = {
    ...req.body,
    employeeId: req.user._id,
    branchId: (req.user.role === 'super_admin' && req.body.branchId) ? req.body.branchId : req.user.branchId,
  };

  if (!expensePayload.branchId) {
    return next(new AppError('Branch assignment is required to log an expense.', 400));
  }

  const expense = await Expense.create(expensePayload);

  const populatedExpense = await Expense.findById(expense._id)
    .populate('employeeId', 'name email')
    .populate('branchId', 'branchName branchCode');

  res.status(201).json({ success: true, data: populatedExpense });
});

exports.getExpenses = catchAsync(async (req, res, next) => {
  const filter = {};

  if (req.user.role === 'super_admin') {
    if (req.query.branchId) {
      filter.branchId = req.query.branchId;
    }
  } else if (req.user.role === 'branch_admin') {
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (branchId) {
      filter.branchId = branchId;
    }
  } else {
    filter.employeeId = req.user._id;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.category) {
    filter.category = req.query.category;
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [expenses, total] = await Promise.all([
    Expense.find(filter)
      .populate('employeeId', 'name employeeId role phone')
      .populate('branchId', 'branchName branchCode')
      .populate('approvedBy', 'name')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Expense.countDocuments(filter),
  ]);

  const pendingCount = await Expense.countDocuments({
    ...filter,
    status: { $in: ['PENDING_BRANCH', 'PENDING_HQ'] }
  });

  res.status(200).json({
    success: true,
    count: expenses.length,
    total,
    pendingCount,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: expenses,
  });
});

exports.getExpenseStats = catchAsync(async (req, res, next) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const baseFilter = req.user.role === 'super_admin'
    ? {}
    : req.user.role === 'branch_admin'
      ? { branchId: req.user.branchId }
      : { employeeId: req.user._id };

  const [todayTotal, overallTotal, byUser, byCategory, pendingExpenses] = await Promise.all([
    Expense.aggregate([
      { $match: { ...baseFilter, billDate: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: baseFilter },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$employeeId',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          name: '$user.name',
          employeeId: '$user.employeeId',
          role: '$user.role',
          total: 1,
          count: 1,
        },
      },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
    Expense.countDocuments({ ...baseFilter, status: { $in: ['PENDING_BRANCH', 'PENDING_HQ'] } }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      todayTotal: todayTotal[0]?.total || 0,
      todayCount: todayTotal[0]?.count || 0,
      overallTotal: overallTotal[0]?.total || 0,
      overallCount: overallTotal[0]?.count || 0,
      pendingCount: pendingExpenses,
      byUser,
      byCategory,
    },
  });
});

exports.updateExpenseStatus = catchAsync(async (req, res, next) => {
  const { status, rejectionReason } = req.body;
  
  if (!['APPROVED', 'REJECTED', 'BRANCH_APPROVED'].includes(status)) {
    return next(new AppError('Invalid status', 400));
  }

  if (status === 'REJECTED' && !rejectionReason) {
    return next(new AppError('Rejection reason is required', 400));
  }

  const expense = await Expense.findById(req.params.id);
  if (!expense) return next(new AppError('Expense not found', 404));

  if (expense.status === 'APPROVED' || expense.status === 'REJECTED') {
    return next(new AppError('This expense has already been processed', 400));
  }

  const expBranchId = expense.branchId?.toString();
  const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;

  if (status === 'BRANCH_APPROVED') {
    if (req.user.role !== 'branch_admin' && req.user.role !== 'office') {
      return next(new AppError('Only Branch Admin can approve at branch level', 403));
    }
    if (req.user.role === 'branch_admin' && expBranchId !== userBranchId) {
      return next(new AppError('Permission Denied - Not your branch', 403));
    }
    if (expense.status !== 'PENDING_BRANCH') {
      return next(new AppError('Expense is not pending branch approval', 400));
    }
    expense.status = 'PENDING_HQ';
  } else if (status === 'APPROVED') {
    if (req.user.role !== 'super_admin') {
      return next(new AppError('Only Super Admin can give final approval', 403));
    }
    if (expense.status !== 'PENDING_HQ') {
      return next(new AppError('Expense is not pending HQ approval', 400));
    }
    expense.status = 'APPROVED';
    
    // HQ Account - Expense Reimbursement
    await HQAccount.create({
      type: 'EXPENSE',
      source: 'EXPENSE_REIMBURSEMENT',
      amount: expense.amount,
      balanceAfter: 0,
      relatedId: expense._id,
      relatedModel: 'Expense',
      branchId: expense.branchId,
      description: `Expense reimbursement: ${expense.description} (${expense.category})`,
      paymentMode: 'CASH',
      performedBy: req.user._id,
      date: new Date()
    });

    // Employee Ledger - Credit for approved expense
    const empBalance = await EmployeeLedger.getUserBalance(expense.employeeId);
    await EmployeeLedger.create({
      userId: expense.employeeId,
      branchId: expense.branchId,
      type: 'CREDIT',
      category: 'EXPENSE_APPROVED',
      amount: expense.amount,
      balanceAfter: empBalance.balance + expense.amount,
      relatedId: expense._id,
      relatedModel: 'Expense',
      description: `Expense approved: ${expense.description} (${expense.category})`,
      performedBy: req.user._id,
      date: new Date()
    });

    // Branch Ledger - Record expense reimbursement
    const branchBalance = await BranchLedger.getBranchBalance(expense.branchId);
    await BranchLedger.create({
      branchId: expense.branchId,
      type: 'DEBIT',
      category: 'EXPENSE_REIMBURSEMENT_PAID',
      amount: expense.amount,
      balanceAfter: branchBalance.balance - expense.amount,
      relatedId: expense._id,
      relatedModel: 'Expense',
      employeeId: expense.employeeId,
      description: `Expense reimbursement paid to employee: ${expense.description}`,
      performedBy: req.user._id,
      date: new Date()
    });
  } else if (status === 'REJECTED') {
    if (req.user.role === 'branch_admin' && expense.status === 'PENDING_BRANCH') {
      if (expBranchId !== userBranchId) {
        return next(new AppError('Permission Denied', 403));
      }
    } else if (req.user.role !== 'super_admin') {
      return next(new AppError('Only Super Admin can reject at HQ level', 403));
    }
    expense.status = 'REJECTED';
    expense.rejectionReason = rejectionReason;
  }

  expense.approvedBy = req.user._id;
  expense.approvedAt = new Date();
  expense.reviewedAt = new Date();
  
  await expense.save();

  await sendExpenseNotification(expense, status, rejectionReason);

  const populatedExpense = await Expense.findById(expense._id)
    .populate('employeeId', 'name email')
    .populate('approvedBy', 'name');

  res.status(200).json({ success: true, data: populatedExpense });
});

exports.deleteExpense = catchAsync(async (req, res, next) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return next(new AppError('Expense not found', 404));

  if (expense.employeeId.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
    return next(new AppError('Permission Denied', 403));
  }
  if (expense.status === 'APPROVED' || expense.status === 'REJECTED') {
    return next(new AppError('Cannot delete an already processed expense', 400));
  }

  await Expense.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: 'Expense deleted' });
});

exports.getExpenseById = catchAsync(async (req, res, next) => {
  const expense = await Expense.findById(req.params.id)
    .populate('employeeId', 'name employeeId role phone email')
    .populate('branchId', 'branchName branchCode')
    .populate('approvedBy', 'name');

  if (!expense) {
    return next(new AppError('Expense not found', 404));
  }

  if (req.user.role !== 'super_admin') {
    if (expense.employeeId._id.toString() !== req.user._id.toString()) {
      const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
      if (expense.branchId._id.toString() !== userBranchId) {
        return next(new AppError('Permission Denied', 403));
      }
    }
  }

  res.status(200).json({ success: true, data: expense });
});
