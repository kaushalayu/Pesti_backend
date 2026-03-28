const Customer = require('../models/Customer');
const ServiceForm = require('../models/ServiceForm');
const Receipt = require('../models/Receipt');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');

exports.createCustomer = catchAsync(async (req, res, next) => {
  const payload = {
    ...req.body,
    branchId: (req.user.role === 'super_admin' && req.body.branchId) ? req.body.branchId : req.user.branchId,
  };

  if (!payload.branchId) {
    return next(new AppError('Branch assignment is required.', 400));
  }

  const customer = await Customer.create(payload);

  res.status(201).json({ success: true, data: customer });
});

exports.getCustomers = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    queryObj.branchId = req.user.branchId;
  } else if (req.user.role === 'technician' || req.user.role === 'sales') {
    queryObj._id = { $in: [] };
  }

  if (queryObj.search) {
    const searchRegex = { $regex: queryObj.search, $options: 'i' };
    queryObj.$or = [{ name: searchRegex }, { phone: searchRegex }, { city: searchRegex }];
    delete queryObj.search;
  }

  let query = Customer.find(queryObj).populate('branchId', 'branchName city');

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  const { data, pagination } = await paginate(query, req.query);

  res.status(200).json({ success: true, count: data.length, pagination, data });
});

exports.getCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id).populate('branchId', 'branchName city address phone');

  if (!customer) {
    return next(new AppError('Customer not found', 404));
  }

  if (req.user.role !== 'super_admin' && customer.branchId._id.toString() !== req.user.branchId.toString()) {
    return next(new AppError('Permission Denied', 403));
  }

  const jobs = await ServiceForm.find({ 'customer.phone': customer.phone })
    .sort('-createdAt')
    .limit(10)
    .populate('employeeId', 'name')
    .populate('branchId', 'branchName');

  const payments = await Receipt.find({ customerPhone: customer.phone })
    .sort('-createdAt')
    .limit(10)
    .populate('employeeId', 'name');

  res.status(200).json({ success: true, data: customer, jobs, payments });
});

exports.updateCustomer = catchAsync(async (req, res, next) => {
  let customer = await Customer.findById(req.params.id);

  if (!customer) {
    return next(new AppError('Customer not found', 404));
  }

  if (req.user.role !== 'super_admin' && customer.branchId.toString() !== req.user.branchId.toString()) {
    return next(new AppError('Permission Denied', 403));
  }

  customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

  res.status(200).json({ success: true, data: customer });
});

exports.deleteCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    return next(new AppError('Customer not found', 404));
  }

  if (req.user.role !== 'super_admin') {
    return next(new AppError('Permission Denied', 403));
  }

  await customer.deleteOne();

  res.status(200).json({ success: true, message: 'Customer deleted' });
});
