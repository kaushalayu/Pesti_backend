const ServiceRate = require('../models/ServiceRate');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

exports.createServiceRate = catchAsync(async (req, res, next) => {
  const { serviceName, category, premisesType, price, description, branchId } = req.body;
  
  const existingRate = await ServiceRate.findOne({ 
    serviceName, 
    category, 
    branchId: branchId || null 
  });
  
  if (existingRate) {
    return next(new AppError('Rate already exists for this service/category combination', 400));
  }

  const rate = await ServiceRate.create({
    serviceName,
    category,
    premisesType: premisesType || 'General',
    price,
    description,
    branchId: branchId || null
  });

  res.status(201).json({ success: true, data: rate });
});

exports.getServiceRates = catchAsync(async (req, res, next) => {
  const { category, serviceName, branchId } = req.query;
  
  const query = { isActive: true };
  
  if (category) query.category = category;
  if (serviceName) query.serviceName = serviceName;
  if (branchId) query.branchId = branchId;
  
  const rates = await ServiceRate.find(query)
    .select('serviceName price')
    .sort('serviceName')
    .lean();
  
  res.status(200).json({ success: true, count: rates.length, data: rates });
});

exports.getRateByService = catchAsync(async (req, res, next) => {
  const { serviceName, category, branchId } = req.query;
  
  if (!serviceName || !category) {
    return next(new AppError('Please provide serviceName and category', 400));
  }
  
  const query = { 
    serviceName, 
    category, 
    isActive: true,
    $or: [
      { branchId: branchId || null },
      { branchId: { $exists: false } }
    ]
  };
  
  const rate = await ServiceRate.findOne(query).sort({ branchId: -1 });
  
  if (!rate) {
    return next(new AppError('Rate not found for this service', 404));
  }
  
  res.status(200).json({ success: true, data: rate });
});

exports.updateServiceRate = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  const rate = await ServiceRate.findByIdAndUpdate(
    id,
    req.body,
    { returnDocument: 'after', runValidators: true }
  );
  
  if (!rate) {
    return next(new AppError('Service rate not found', 404));
  }
  
  res.status(200).json({ success: true, data: rate });
});

exports.deleteServiceRate = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  const rate = await ServiceRate.findByIdAndUpdate(
    id,
    { isActive: false },
    { returnDocument: 'after' }
  );
  
  if (!rate) {
    return next(new AppError('Service rate not found', 404));
  }
  
  res.status(200).json({ success: true, data: rate });
});

exports.getAllServiceRatesAdmin = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 50, category, branchId } = req.query;
  
  const query = {};
  if (category) query.category = category;
  if (branchId) query.branchId = branchId;
  
  const rates = await ServiceRate.find(query)
    .populate('branchId', 'branchName city')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  
  const total = await ServiceRate.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: rates.length,
    total,
    totalPages: Math.ceil(total / limit),
    data: rates
  });
});
