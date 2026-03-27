const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const User = require('../models/User');
const ServiceForm = require('../models/ServiceForm');
const Receipt = require('../models/Receipt');
const Enquiry = require('../models/Enquiry');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

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

  res.status(200).json({
    success: true,
    data: {
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
    },
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
