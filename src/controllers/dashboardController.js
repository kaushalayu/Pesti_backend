const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const User = require('../models/User');
const ServiceForm = require('../models/ServiceForm');
const Receipt = require('../models/Receipt');
const Enquiry = require('../models/Enquiry');
const Expense = require('../models/Expense');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const cache = require('../utils/cache');

// Helper to filter by branch if needed
const getBranchFilter = (req) => {
  if (req.user.role === 'super_admin') return {};
  if (req.user.role === 'branch_admin' || req.user.role === 'office') return { branchId: req.user.branchId };
  if (req.user.role === 'technician' || req.user.role === 'sales') return { employeeId: req.user._id };
  return { branchId: req.user.branchId };
};

// @desc    Get aggregated overview stats for Dashboard
// @route   GET /api/dashboard/stats
// @access  Private (Admins)
exports.getOverviewStats = catchAsync(async (req, res, next) => {
  const branchFilter = getBranchFilter(req);
  const cacheKey = `dashboard:stats:${req.user.role}:${req.user.branchId || 'all'}`;
  
  // Check cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, cached: true });
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Parallelize the count queries
  const [
    totalBranches,
    totalEmployees,
    formsToday,
    formsWeek,
    formsMonth,
    pendingPayments,
    todayCollection,
    overallCollection,
    distanceStats,
  ] = await Promise.all([
    Branch.countDocuments(req.user.role === 'super_admin' ? {} : { _id: req.user.branchId }),
    User.countDocuments(branchFilter),
    ServiceForm.countDocuments({ ...branchFilter, createdAt: { $gte: startOfDay } }),
    ServiceForm.countDocuments({ ...branchFilter, createdAt: { $gte: startOfWeek } }),
    ServiceForm.countDocuments({ ...branchFilter, createdAt: { $gte: startOfMonth } }),
    Receipt.aggregate([
      { $match: { ...branchFilter, status: { $in: ['PENDING', 'PARTIAL'] } } },
      { $group: { _id: null, totalDue: { $sum: '$balanceDue' } } }
    ]),
    // Today's total cash collected
    Receipt.aggregate([
      { $match: { ...branchFilter, createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$advancePaid' } } }
    ]),
    // Overall total ever collected
    Receipt.aggregate([
      { $match: branchFilter },
      { $group: { _id: null, total: { $sum: '$advancePaid' } } }
    ]),
    // New: Calculate total distance traveled
    ServiceForm.aggregate([
      { $match: { ...branchFilter, 'logistics.startMeter': { $ne: null }, 'logistics.endMeter': { $ne: null } } },
      { 
        $group: { 
          _id: null, 
          total: { $sum: { $subtract: ["$logistics.endMeter", "$logistics.startMeter"] } } 
        } 
      }
    ]),
  ]);

  const data = {
    branches: totalBranches,
    employees: totalEmployees,
    forms: {
      today: formsToday,
      week: formsWeek,
      month: formsMonth,
    },
    pendingRevenue: pendingPayments.length ? pendingPayments[0].totalDue : 0,
    todayCollection: todayCollection.length ? todayCollection[0].total : 0,
    overallCollection: overallCollection.length ? overallCollection[0].total : 0,
    totalDistance: distanceStats.length ? distanceStats[0].total : 0,
  };

  // Cache for 2 minutes
  await cache.set(cacheKey, data, 120);

  res.status(200).json({
    success: true,
    data,
  });
});

// @desc    Get Revenue Analytics (Bar Chart info)
// @route   GET /api/dashboard/revenue
// @access  Private (Admins)
exports.getRevenueAnalytics = catchAsync(async (req, res, next) => {
  const branchFilter = getBranchFilter(req);

  const revenueByBranch = await Receipt.aggregate([
    { $match: { ...branchFilter, status: 'PAID' } },
    {
      $group: {
        _id: '$branchId',
        totalRevenue: { $sum: '$amount' },
        totalCollected: { $sum: '$advancePaid' },
      },
    },
    {
      $lookup: {
        from: 'branches',
        localField: '_id',
        foreignField: '_id',
        as: 'branchDetails',
      },
    },
    { $unwind: '$branchDetails' },
    {
      $project: {
        branchName: '$branchDetails.branchName',
        cityPrefix: '$branchDetails.cityPrefix',
        totalRevenue: 1,
        totalCollected: 1,
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  const sixMonthTrend = await Receipt.aggregate([
    { $match: branchFilter },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        revenue: { $sum: '$advancePaid' },
      },
    },
    { $sort: { '_id.year': -1, '_id.month': -1 } },
    { $limit: 6 },
  ]);

  res.status(200).json({
    success: true,
    data: {
      byBranch: revenueByBranch,
      sixMonthTrend: sixMonthTrend.reverse(), // chronologically
    },
  });
});

// @desc    Get Enquiry Funnel
// @route   GET /api/dashboard/enquiry-funnel
// @access  Private (Admins)
exports.getEnquiryFunnel = catchAsync(async (req, res, next) => {
  const branchFilter = getBranchFilter(req);

  const stats = await Enquiry.aggregate([
    { $match: branchFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: stats,
  });
});

// @desc    Get Recent Global Activity Feed (Substitutions for ActivityLog collection)
// @route   GET /api/dashboard/activity
// @access  Private (Admins)
exports.getRecentActivity = catchAsync(async (req, res, next) => {
  const branchFilter = getBranchFilter(req);

  // Since we don't have a dedicated ActivityLog structure mapped out in models yet,
  // we will pull the latest 5 creations from core modules to emulate an activity feed.
  const [recentForms, recentEnquiries, recentReceipts] = await Promise.all([
    ServiceForm.find(branchFilter).sort('-createdAt').limit(5).populate('employeeId', 'name').lean(),
    Enquiry.find(branchFilter).sort('-createdAt').limit(5).populate('addedBy', 'name').lean(),
    Receipt.find(branchFilter).sort('-createdAt').limit(5).populate('employeeId', 'name').lean(),
  ]);

  // Merge and sort in JS
  let activity = [
    ...recentForms.map(f => ({
      type: 'FORM_CREATED',
      timestamp: f.createdAt,
      description: `Job Form ${f.orderNo || 'Draft'} created`,
      user: f.employeeId?.name || 'Unknown',
      meta: f.orderNo,
    })),
    ...recentEnquiries.map(e => ({
      type: 'ENQUIRY_ADDED',
      timestamp: e.createdAt,
      description: `New lead: ${e.customerName || 'Unknown Client'}`,
      user: e.addedBy?.name || 'Unknown',
      meta: e.enquiryId,
    })),
    ...recentReceipts.map(r => ({
      type: 'RECEIPT_GENERATED',
      timestamp: r.createdAt,
      description: `Receipt ${r.receiptNo || 'pending'} — ₹${r.amount}`,
      user: r.employeeId?.name || 'Unknown',
      meta: r.receiptNo,
    })),
  ];

  activity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  activity = activity.slice(0, 15); // Top 15 recent actions

  res.status(200).json({
    success: true,
    data: activity,
  });
});

// @desc    Get Employee Performance (Target vs Achievement)
// @route   GET /api/dashboard/employee-performance
// @access  Private (Super Admin / Branch Admin)
exports.getEmployeePerformance = catchAsync(async (req, res, next) => {
  const branchFilter = req.user.role === 'branch_admin' ? { branchId: req.user.branchId } : {};
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const employeeStats = await User.aggregate([
    { $match: { ...branchFilter, role: { $in: ['technician', 'sales'] } } },
    {
      $lookup: {
        from: 'serviceforms',
        localField: '_id',
        foreignField: 'employeeId',
        as: 'jobs'
      }
    },
    {
      $lookup: {
        from: 'enquiries',
        localField: '_id',
        foreignField: 'addedBy',
        as: 'enquiries'
      }
    },
    {
      $lookup: {
        from: 'receipts',
        localField: '_id',
        foreignField: 'employeeId',
        as: 'receipts'
      }
    },
    {
      $project: {
        name: 1,
        employeeId: 1,
        role: 1,
        branchId: 1,
        totalJobs: { $size: '$jobs' },
        completedJobs: {
          $size: { $filter: { input: '$jobs', cond: { $eq: ['$$this.status', 'COMPLETED'] } } }
        },
        totalEnquiries: { $size: '$enquiries' },
        convertedEnquiries: {
          $size: { $filter: { input: '$enquiries', cond: { $eq: ['$$this.status', 'CONVERTED'] } } }
        },
        totalCollections: {
          $sum: { $map: { input: '$receipts', as: 'r', in: '$$r.advancePaid' } }
        },
        thisMonthJobs: {
          $size: { $filter: { input: '$jobs', cond: { $gte: ['$$this.createdAt', startOfMonth] } } }
        },
        thisMonthCollections: {
          $sum: { $map: { input: { $filter: { input: '$receipts', cond: { $gte: ['$$this.createdAt', startOfMonth] } } }, as: 'r', in: '$$r.advancePaid' } }
        }
      }
    },
    { $sort: { totalJobs: -1 } }
  ]);

  res.status(200).json({
    success: true,
    data: employeeStats
  });
});

// @desc    Get ALL dashboard data in ONE call (Performance optimization)
// @route   GET /api/dashboard/combined
// @access  Private (Admins)
exports.getCombinedDashboard = catchAsync(async (req, res, next) => {
  const branchFilter = getBranchFilter(req);
  const now = new Date();
  
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Run all queries in parallel for maximum performance
  const [
    statsResult,
    revenueResult,
    funnelResult,
    activityResult,
    pendingReceipts,
    pendingExpenses
  ] = await Promise.all([
    // Combined stats in single aggregation
    Promise.all([
      Branch.countDocuments(req.user.role === 'super_admin' ? {} : { _id: req.user.branchId }),
      User.countDocuments(branchFilter),
      ServiceForm.countDocuments({ ...branchFilter, createdAt: { $gte: startOfDay } }),
      ServiceForm.countDocuments({ ...branchFilter, createdAt: { $gte: startOfWeek } }),
      ServiceForm.countDocuments({ ...branchFilter, createdAt: { $gte: startOfMonth } }),
      // Combined Receipt stats in single query (only APPROVED receipts count)
      Receipt.aggregate([
        { $match: { ...branchFilter, approvalStatus: 'APPROVED' } },
        { $facet: {
          pending: [{ $match: { status: { $in: ['PENDING', 'PARTIAL'] } } }, { $group: { _id: null, totalDue: { $sum: '$balanceDue' } } }],
          today: [{ $match: { createdAt: { $gte: startOfDay } } }, { $group: { _id: null, total: { $sum: '$advancePaid' } } }],
          overall: [{ $group: { _id: null, total: { $sum: '$advancePaid' } } }]
        }}
      ]),
    ]),
    
    // Revenue - branch breakdown (optimized projection - only APPROVED receipts)
    Receipt.aggregate([
      { $match: { ...branchFilter, approvalStatus: 'APPROVED', status: 'PAID' } },
      { $group: { _id: '$branchId', totalCollected: { $sum: '$advancePaid' } } },
      { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
      { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
      { $project: { branchName: { $ifNull: ['$branch.branchName', 'Unknown'] }, totalCollected: 1 } },
      { $sort: { totalCollected: -1 } },
      { $limit: 5 }
    ]),
    
    // Funnel - optimized
    Enquiry.aggregate([
      { $match: branchFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    
    // Activity - recent items (optimized lean queries - only APPROVED receipts)
    Promise.all([
      ServiceForm.find(branchFilter).sort('-createdAt').limit(5).select('orderNo status createdAt').lean(),
      Enquiry.find(branchFilter).sort('-createdAt').limit(5).select('customerName createdAt').lean(),
      Receipt.find({ ...branchFilter, approvalStatus: 'APPROVED' }).sort('-createdAt').limit(5).select('receiptNo advancePaid createdAt').lean(),
    ]).then(([forms, enqs, rcpts]) => {
      let activity = [
        ...forms.map(f => ({ type: 'FORM', timestamp: f.createdAt, description: `Job ${f.orderNo || 'Draft'} - ${f.status}` })),
        ...enqs.map(e => ({ type: 'ENQUIRY', timestamp: e.createdAt, description: `Lead: ${e.customerName || 'Unknown'}` })),
        ...rcpts.map(r => ({ type: 'RECEIPT', timestamp: r.createdAt, description: `Receipt ₹${r.advancePaid || 0}` })),
      ];
      return activity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);
    }),
    
    // Pending approvals (role-based)
    Receipt.find({ ...branchFilter, approvalStatus: 'PENDING' })
      .select('receiptNo totalAmount customerName paymentMode createdAt')
      .sort('-createdAt')
      .limit(5)
      .lean(),
    
    // Pending expenses (role-based)
    Expense.find({ ...branchFilter, status: 'PENDING' })
      .select('amount category description employeeId createdAt')
      .sort('-createdAt')
      .limit(5)
      .populate('employeeId', 'name')
      .lean()
  ]);

  const [
    totalBranches,
    totalEmployees,
    formsToday,
    formsWeek,
    formsMonth,
    receiptStats,
  ] = statsResult;

  const { pending, today, overall } = receiptStats[0] || { pending: [], today: [], overall: [] };

  res.status(200).json({
    success: true,
    data: {
      stats: {
        branches: totalBranches,
        employees: totalEmployees,
        forms: { today: formsToday, week: formsWeek, month: formsMonth },
        pendingRevenue: pending[0]?.totalDue || 0,
        todayCollection: today[0]?.total || 0,
        overallCollection: overall[0]?.total || 0,
      },
      revenue: revenueResult,
      funnel: funnelResult,
      activity: activityResult,
        pendingApprovals: pendingReceipts,
      pendingExpenses: pendingExpenses,
    }
  });
});
