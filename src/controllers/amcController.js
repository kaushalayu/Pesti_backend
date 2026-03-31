const AMC = require('../models/AMC');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { paginate } = require('../utils/paginate');
const { generateAutoId } = require('../utils/autoId');

exports.createAMC = catchAsync(async (req, res, next) => {
  try {
    // Clean up empty strings - convert to null for ObjectId fields
    const cleanBody = { ...req.body };
    if (!cleanBody.customerId || cleanBody.customerId === '') cleanBody.customerId = null;
    if (!cleanBody.branchId || cleanBody.branchId === '') cleanBody.branchId = null;
    
    const branchId = (req.user.role === 'super_admin' && cleanBody.branchId) ? cleanBody.branchId : req.user.branchId;

    if (!branchId) {
      return next(new AppError('Branch assignment is required.', 400));
    }

    const payload = {
      ...cleanBody,
      branchId,
      employeeId: req.user._id,
    };

    const amc = await AMC.create(payload);

    res.status(201).json({ success: true, data: amc });
  } catch (error) {
    console.error('AMC creation error:', error);
    return next(new AppError(`AMC creation failed: ${error.message}`, 400));
  }
});

exports.getAMCs = catchAsync(async (req, res, next) => {
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    const branchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
    if (branchId) {
      queryObj.branchId = branchId;
    }
  } else if (req.user.role === 'technician' || req.user.role === 'sales') {
    queryObj.employeeId = req.user._id;
  }

  if (queryObj.search) {
    const searchRegex = { $regex: queryObj.search, $options: 'i' };
    queryObj.$or = [{ customerName: searchRegex }, { customerPhone: searchRegex }, { contractNo: searchRegex }];
    delete queryObj.search;
  }

  let query = AMC.find(queryObj)
    .populate('branchId', 'branchName')
    .populate('employeeId', 'name');

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  const { data, pagination } = await paginate(query, req.query);

  res.status(200).json({ success: true, count: data.length, pagination, data });
});

exports.getAMC = catchAsync(async (req, res, next) => {
  const amc = await AMC.findById(req.params.id)
    .populate('branchId', 'branchName city')
    .populate('employeeId', 'name phone');

  if (!amc) {
    return next(new AppError('AMC Contract not found', 404));
  }

  const amcBranchId = amc.branchId?._id?.toString() || amc.branchId?.toString();
  const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
  if (req.user.role !== 'super_admin' && amcBranchId !== userBranchId) {
    return next(new AppError('Permission Denied', 403));
  }

  res.status(200).json({ success: true, data: amc });
});

exports.updateAMC = catchAsync(async (req, res, next) => {
  let amc = await AMC.findById(req.params.id);

  if (!amc) {
    return next(new AppError('AMC Contract not found', 404));
  }

  const amcBranchId = amc.branchId?.toString();
  const userBranchId = req.user.branchId?._id?.toString() || req.user.branchId?.toString() || req.user.branchId;
  if (req.user.role !== 'super_admin' && amcBranchId !== userBranchId) {
    return next(new AppError('Permission Denied', 403));
  }

  amc = await AMC.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

  res.status(200).json({ success: true, data: amc });
});

exports.renewAMC = catchAsync(async (req, res, next) => {
  const existingAMC = await AMC.findById(req.params.id);

  if (!existingAMC) {
    return next(new AppError('AMC Contract not found', 404));
  }

  const { period, totalAmount, paidAmount } = req.body;
  
  const startDate = new Date(existingAMC.endDate);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + period);

  const newAMC = await AMC.create({
    customerId: existingAMC.customerId,
    customerName: existingAMC.customerName,
    customerPhone: existingAMC.customerPhone,
    customerAddress: existingAMC.customerAddress,
    serviceType: existingAMC.serviceType,
    premisesType: existingAMC.premisesType,
    contractNo: await generateAutoId(AMC, 'AMC-', 'contractNo', 6),
    startDate,
    endDate,
    period,
    totalAmount,
    paidAmount: paidAmount || 0,
    status: 'ACTIVE',
    servicesIncluded: existingAMC.servicesIncluded,
    branchId: existingAMC.branchId,
    employeeId: req.user._id,
  });

  existingAMC.status = 'RENEWED';
  await existingAMC.save();

  res.status(201).json({ success: true, data: newAMC });
});

exports.deleteAMC = catchAsync(async (req, res, next) => {
  const amc = await AMC.findById(req.params.id);

  if (!amc) {
    return next(new AppError('AMC Contract not found', 404));
  }

  if (req.user.role !== 'super_admin') {
    return next(new AppError('Permission Denied', 403));
  }

  await amc.deleteOne();

  res.status(200).json({ success: true, message: 'AMC Contract deleted' });
});

exports.getExpiringAMCs = catchAsync(async (req, res, next) => {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const query = {
    status: 'ACTIVE',
    endDate: { $lte: thirtyDaysFromNow }
  };

  if (req.user.role === 'branch_admin') {
    query.branchId = req.user.branchId;
  }

  const expiringAMCs = await AMC.find(query)
    .populate('branchId', 'branchName')
    .sort('endDate');

  res.status(200).json({ success: true, count: expiringAMCs.length, data: expiringAMCs });
});

exports.getAMCsByPhone = catchAsync(async (req, res, next) => {
  const { phone } = req.params;
  
  if (!phone) {
    return next(new AppError('Phone number is required', 400));
  }

  const query = { customerPhone: phone };
  
  if (req.user.role === 'branch_admin') {
    query.branchId = req.user.branchId;
  }

  const amcs = await AMC.find(query)
    .populate('branchId', 'branchName')
    .populate('employeeId', 'name')
    .sort('-createdAt');

  res.status(200).json({ success: true, count: amcs.length, data: amcs });
});
