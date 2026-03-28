const express = require('express');
const {
  getOverviewStats,
  getRevenueAnalytics,
  getEnquiryFunnel,
  getRecentActivity,
  getEmployeePerformance,
} = require('../controllers/dashboardController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/stats', restrictTo('super_admin', 'branch_admin'), getOverviewStats);
router.get('/revenue', restrictTo('super_admin', 'branch_admin'), getRevenueAnalytics);
router.get('/enquiry-funnel', restrictTo('super_admin', 'branch_admin'), getEnquiryFunnel);
router.get('/activity', restrictTo('super_admin', 'branch_admin'), getRecentActivity);
router.get('/employee-performance', restrictTo('super_admin', 'branch_admin'), getEmployeePerformance);

module.exports = router;
