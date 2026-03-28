const Expense = require('../models/Expense');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Log a new expense
// @route   POST /api/expenses
// @access  Private (All roles)
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

  res.status(201).json({ success: true, data: expense });
});

// @desc    Get expenses (role-filtered)
// @route   GET /api/expenses
// @access  Private
exports.getExpenses = catchAsync(async (req, res, next) => {
  const filter = {};

  if (req.user.role === 'super_admin') {
    // See all
  } else if (req.user.role === 'branch_admin') {
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (branchId) {
      filter.branchId = branchId;
    }
  } else {
    // Technician / Sales / Office — only own expenses
    filter.employeeId = req.user._id;
  }

  const expenses = await Expense.find(filter)
    .populate('employeeId', 'name employeeId role')
    .populate('branchId', 'branchName branchCode')
    .populate('approvedBy', 'name')
    .sort('-date');

  res.status(200).json({ success: true, count: expenses.length, data: expenses });
});

// @desc    Get expense summary stats (today + overall per user)
// @route   GET /api/expenses/stats
// @access  Private
exports.getExpenseStats = catchAsync(async (req, res, next) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const baseFilter = req.user.role === 'super_admin'
    ? {}
    : req.user.role === 'branch_admin'
      ? { branchId: req.user.branchId }
      : { employeeId: req.user._id };

  const [todayTotal, overallTotal, byUser] = await Promise.all([
    Expense.aggregate([
      { $match: { ...baseFilter, date: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Expense.aggregate([
      { $match: baseFilter },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    // Per-user breakdown (for Admin/Manager view)
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
  ]);

  res.status(200).json({
    success: true,
    data: {
      todayTotal: todayTotal[0]?.total || 0,
      overallTotal: overallTotal[0]?.total || 0,
      byUser,
    },
  });
});

// @desc    Update expense status (Admin/Branch Admin only)
// @route   PATCH /api/expenses/:id/status
// @access  Private (Branch Admin / Super Admin)
exports.updateExpenseStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return next(new AppError('Invalid status', 400));
  }

  const expense = await Expense.findById(req.params.id);
  if (!expense) return next(new AppError('Expense not found', 404));

  const expBranchId = expense.branchId?.toString();
  const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
  if (req.user.role === 'branch_admin' && expBranchId !== userBranchId) {
    return next(new AppError('Permission Denied', 403));
  }

  expense.status = status;
  expense.approvedBy = req.user._id;
  await expense.save();

  res.status(200).json({ success: true, data: expense });
});

// @desc    Delete own expense (if PENDING)
// @route   DELETE /api/expenses/:id
// @access  Private
exports.deleteExpense = catchAsync(async (req, res, next) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return next(new AppError('Expense not found', 404));

  if (expense.employeeId.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
    return next(new AppError('Permission Denied', 403));
  }
  if (expense.status !== 'PENDING') {
    return next(new AppError('Cannot delete an already processed expense', 400));
  }

  await expense.deleteOne();
  res.status(200).json({ success: true, message: 'Expense deleted' });
});
