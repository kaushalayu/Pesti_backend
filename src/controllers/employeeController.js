const User = require('../models/User');
const Branch = require('../models/Branch');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');
const emailQueue = require('../jobs/emailQueue');

// @desc    Create new employee
// @route   POST /api/employees
// @access  Private (Super Admin / Branch Admin)
exports.createEmployee = catchAsync(async (req, res, next) => {
  const { name, email, phone, role, branchId, designation, isActive, password } = req.body;

  // Branch Admin restriction
  if (req.user.role === 'branch_admin') {
    if (role === 'super_admin' || role === 'branch_admin') {
      return next(new AppError('You cannot create an admin-level user.', 403));
    }
    // Force branchId to the admin's own branch
    if (branchId.toString() !== req.user.branchId.toString()) {
      return next(new AppError('You can only create employees for your own branch.', 403));
    }
  }

  // Auto-generate password if not provided
  const generatedPassword = password || Math.random().toString(36).slice(-8);

  const newUser = await User.create({
    name,
    email,
    phone,
    role,
    branchId,
    designation,
    isActive,
    passwordHash: generatedPassword, 
    profileImage: req.file ? `/uploads/${req.file.filename}` : null,
  });

  // Enqueue Welcome Email
  try {
    await emailQueue.add({
      type: 'WELCOME_EMAIL',
      data: {
        email: newUser.email,
        name: newUser.name,
        password: generatedPassword,
      },
    });
  } catch (error) {
    console.error('Failed to enqueue welcome email:', error.message);
  }

  const { passwordHash, ...userWithoutPassword } = newUser.toObject();

  res.status(201).json({
    success: true,
    data: userWithoutPassword,
  });
});

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private (Super Admin / Branch Admin)
exports.getEmployees = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Branch Admins can ONLY see employees in their branch
  if (req.user.role === 'branch_admin') {
    queryObj.branchId = req.user.branchId;
  }

  // Handle case-insensitive search by name
  if (queryObj.name) {
    queryObj.name = { $regex: queryObj.name, $options: 'i' };
  }

  let query = User.find(queryObj).populate('branchId', 'branchName branchCode city');

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  const { data, pagination } = await paginate(query, req.query);

  res.status(200).json({
    success: true,
    count: data.length,
    pagination,
    data,
  });
});

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private (Super Admin / Branch Admin)
exports.getEmployee = catchAsync(async (req, res, next) => {
  const employee = await User.findById(req.params.id).populate('branchId', 'branchName branchCode city');

  if (!employee) {
    return next(new AppError('No employee found with that ID', 404));
  }

  // Branch Admins can only view their own branch employees
  if (
    req.user.role === 'branch_admin' &&
    employee.branchId._id.toString() !== req.user.branchId.toString()
  ) {
    return next(new AppError('You do not have permission to view this employee.', 403));
  }

  res.status(200).json({
    success: true,
    data: employee,
  });
});

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (Super Admin / Branch Admin)
exports.updateEmployee = catchAsync(async (req, res, next) => {
  const employee = await User.findById(req.params.id);

  if (!employee) {
    return next(new AppError('No employee found with that ID', 404));
  }

  // Branch Admin checks
  if (req.user.role === 'branch_admin') {
    if (employee.branchId.toString() !== req.user.branchId.toString()) {
      return next(new AppError('You can only update employees in your branch.', 403));
    }
    if (req.body.role === 'super_admin' || req.body.role === 'branch_admin') {
      return next(new AppError('You cannot elevate roles to admin level.', 403));
    }
  }

  // Process File upload for profile Image
  if (req.file) {
    req.body.profileImage = `/uploads/${req.file.filename}`;
  }

  // Prevent password update via this route
  delete req.body.password;
  delete req.body.passwordHash;

  const updatedEmployee = await User.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after',
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: updatedEmployee,
  });
});

// @desc    Admin resets employee password
// @route   POST /api/employees/:id/reset-password
// @access  Private (Super Admin / Branch Admin)
exports.adminResetPassword = catchAsync(async (req, res, next) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return next(new AppError('Password must be at least 6 characters.', 400));
  }

  const employee = await User.findById(req.params.id).select('+passwordHash');

  if (!employee) {
    return next(new AppError('No employee found with that ID', 404));
  }

  if (req.user.role === 'branch_admin' && employee.branchId.toString() !== req.user.branchId.toString()) {
    return next(new AppError('You can only change passwords for employees in your branch.', 403));
  }

  employee.passwordHash = newPassword; // Will trigger pre-save bcrypt hash
  await employee.save({ validateBeforeSave: false });

  // Enqueue Password Reset Alert Email
  try {
    await emailQueue.add({
      type: 'PASSWORD_RESET_ALERT',
      data: {
        email: employee.email,
        name: employee.name,
        password: newPassword,
      },
    });
  } catch (error) {
    console.warn('Failed to enqueue reset email:', error.message);
  }

  res.status(200).json({
    success: true,
    message: 'Password reset successfully',
  });
});

// @desc    Get employee activity log (Placeholder)
// @route   GET /api/employees/:id/activity
// @access  Private (Super Admin / Branch Admin)
exports.getEmployeeActivity = catchAsync(async (req, res, next) => {
  res.status(200).json({
    success: true,
    data: {
      message: 'Activity logs will be aggregated from Activity module when built.',
    },
  });
});

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (Super Admin / Branch Admin)
exports.deleteEmployee = catchAsync(async (req, res, next) => {
  const ServiceForm = require('../models/ServiceForm');
  const employee = await User.findById(req.params.id);

  if (!employee) {
    return next(new AppError('No employee found with that ID', 404));
  }

  // Branch Admin checks
  if (req.user.role === 'branch_admin' && (employee.branchId?.toString() !== req.user.branchId.toString())) {
    return next(new AppError('You can only delete employees in your branch.', 403));
  }

  // Check if has dependencies
  const jobsCount = await ServiceForm.countDocuments({ employeeId: req.params.id });
  
  if (jobsCount > 0) {
    // Soft Delete: Just deactivate to preserve Job Card history
    employee.isActive = false;
    await employee.save({ validateBeforeSave: false });
    return res.status(200).json({
      success: true,
      message: 'Personnel deactivated to preserve Service Protocol Integrity (Job History found).',
      deactivated: true
    });
  }

  await User.findByIdAndDelete(req.params.id);

  res.status(204).json({
    success: true,
    data: null,
  });
});
