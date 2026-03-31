const Receipt = require('../models/Receipt');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

exports.getAllCollections = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 50, status } = req.query;
  
  const query = {};
  if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    query.branchId = req.user.branchId;
  } else if (req.user.role !== 'super_admin') {
    query.employeeId = req.user._id;
  }
  if (status) query.approvalStatus = status;

  const skip = (page - 1) * limit;
  
  const collections = await Receipt.find(query)
    .populate('customerId', 'name phone address')
    .populate('employeeId', 'name employeeId')
    .populate('branchId', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Receipt.countDocuments(query);

  res.status(200).json({
    success: true,
    data: collections,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

exports.getCollectionById = catchAsync(async (req, res, next) => {
  const collection = await Receipt.findById(req.params.id)
    .populate('customerId', 'name phone address')
    .populate('employeeId', 'name employeeId')
    .populate('branchId', 'name');

  if (!collection) {
    return next(new AppError('Collection not found', 404));
  }

  res.status(200).json({
    success: true,
    data: collection
  });
});

// @desc    Get Collection stats (Today & Overall) based on Role
// @route   GET /api/collections/stats
// @access  Private
exports.getCollectionStats = catchAsync(async (req, res, next) => {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  let matchQuery = {};
  let groupBy = null;

  // Role Based Logic
  if (req.user.role === 'super_admin') {
    // Super admin sees everything
    matchQuery = {};
    groupBy = '$employeeId'; // Group by employee for detailed view
  } else if (req.user.role === 'branch_admin' || req.user.role === 'office') {
    // Branch admin sees everything for their branch
    matchQuery = { branchId: req.user.branchId };
    groupBy = '$employeeId';
  } else {
    // Regular employees see only their own
    matchQuery = { employeeId: req.user._id };
    groupBy = '$employeeId';
  }

  // 1. Get Overall Collection per User (only APPROVED receipts)
  const overallCollections = await Receipt.aggregate([
    { $match: { ...matchQuery, approvalStatus: 'APPROVED' } },
    {
      $group: {
        _id: groupBy,
        totalCollected: { $sum: '$advancePaid' },
        receiptCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        employeeName: '$userDetails.name',
        employeeId: '$userDetails.employeeId',
        totalCollected: 1,
        receiptCount: 1,
      },
    },
  ]);

  // 2. Get Today's Collection per User (only APPROVED receipts)
  const todayCollections = await Receipt.aggregate([
    { 
      $match: { 
        ...matchQuery, 
        approvalStatus: 'APPROVED',
        createdAt: { $gte: startOfDay, $lte: endOfDay } 
      } 
    },
    {
      $group: {
        _id: groupBy,
        todayCollected: { $sum: '$advancePaid' },
        todayReceiptCount: { $sum: 1 },
      },
    },
  ]);

  // Merge Today's data into Overall data
  const mergedData = overallCollections.map(item => {
    const todayData = todayCollections.find(t => String(t._id) === String(item._id));
    return {
      ...item,
      todayCollected: todayData ? todayData.todayCollected : 0,
      todayReceiptCount: todayData ? todayData.todayReceiptCount : 0,
    };
  });

  // Calculate Global Totals (based on access level)
  const totalStats = mergedData.reduce((acc, curr) => {
    acc.totalOverall += curr.totalCollected;
    acc.totalToday += curr.todayCollected;
    return acc;
  }, { totalOverall: 0, totalToday: 0 });

  res.status(200).json({
    success: true,
    data: {
      summary: totalStats,
      details: mergedData
    },
  });
});
