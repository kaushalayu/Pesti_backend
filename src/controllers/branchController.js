const Branch = require('../models/Branch');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');

// @desc    Create new branch
// @route   POST /api/branches
// @access  Private (Super Admin)
exports.createBranch = catchAsync(async (req, res, next) => {
  const newBranch = await Branch.create(req.body);

  res.status(201).json({
    success: true,
    data: newBranch,
  });
});

// @desc    Get all branches (paginated & filtered)
// @route   GET /api/branches
// @access  Private (Super Admin / Branch Admin read-only)
exports.getBranches = catchAsync(async (req, res, next) => {
  // Build query
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Handle case-insensitive city search if provided
  if (queryObj.city) {
    queryObj.city = { $regex: queryObj.city, $options: 'i' };
  }

  // If user is just a branch Admin, they might only see their active branch.
  // We'll allow them to see all branches if needed, or filter by their own.
  // Based on spec, Super Admin manages them. Branch admins just view.
  if (req.user.role !== 'super_admin') {
    queryObj.isActive = true; // Non-super admins only see active branches
  }

  let query = Branch.find(queryObj).populate('adminId', 'name email employeeId');

  // Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // Execution with Pagination
  const { data, pagination } = await paginate(query, req.query);

  res.status(200).json({
    success: true,
    count: data.length,
    pagination,
    data,
  });
});

// @desc    Get single branch by ID
// @route   GET /api/branches/:id
// @access  Private (Super Admin)
exports.getBranch = catchAsync(async (req, res, next) => {
  const branch = await Branch.findById(req.params.id).populate('adminId', 'name email employeeId');

  if (!branch) {
    return next(new AppError('No branch found with that ID', 404));
  }

  res.status(200).json({
    success: true,
    data: branch,
  });
});

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private (Super Admin)
exports.updateBranch = catchAsync(async (req, res, next) => {
  const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!branch) {
    return next(new AppError('No branch found with that ID', 404));
  }

  res.status(200).json({
    success: true,
    data: branch,
  });
});

// @desc    Activate/Deactivate branch (Soft Delete)
// @route   PATCH /api/branches/:id/status
// @access  Private (Super Admin)
exports.toggleBranchStatus = catchAsync(async (req, res, next) => {
  const { isActive } = req.body;

  if (isActive === undefined) {
    return next(new AppError('Please provide isActive boolean', 400));
  }

  const branch = await Branch.findByIdAndUpdate(
    req.params.id,
    { isActive },
    { new: true, runValidators: true }
  );

  if (!branch) {
    return next(new AppError('No branch found with that ID', 404));
  }

  res.status(200).json({
    success: true,
    message: `Branch successfully ${isActive ? 'activated' : 'deactivated'}`,
    data: branch,
  });
});

// @desc    Get branch stats (Forms, receipts, revenue etc)
// @route   GET /api/branches/:id/stats
// @access  Private (Super Admin / Branch Admin)
exports.getBranchStats = catchAsync(async (req, res, next) => {
  const branchId = req.params.id;
  
  // Verify ownership if branch admin
  if (req.user.role === 'branch_admin' && req.user.branchId.toString() !== branchId) {
    return next(new AppError('You can only view stats for your own branch.', 403));
  }

  // (This will be fully populated when Forms/Receipt modules are built)
  // For now, placeholder for Branch stats aggregation
  
  res.status(200).json({
    success: true,
    data: {
      branchId,
      message: 'Branch analytics will attach to Forms & Receipts aggregations.',
      totalRevenue: 0,
      totalForms: 0,
      activeEmployees: 0
    },
  });
});

// @desc    Hard Delete branch (Optional based on business rules)
// @route   DELETE /api/branches/:id
// @access  Private (Super Admin)
exports.deleteBranch = catchAsync(async (req, res, next) => {
  const branch = await Branch.findByIdAndDelete(req.params.id);

  if (!branch) {
    return next(new AppError('No branch found with that ID', 404));
  }

  res.status(204).json({
    success: true,
    data: null,
  });
});
