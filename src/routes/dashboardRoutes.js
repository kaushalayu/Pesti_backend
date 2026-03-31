const express = require('express');
const {
  getOverviewStats,
  getRevenueAnalytics,
  getEnquiryFunnel,
  getRecentActivity,
  getEmployeePerformance,
  getCombinedDashboard,
} = require('../controllers/dashboardController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/combined', getCombinedDashboard);
router.get('/stats', getOverviewStats);
router.get('/revenue', getRevenueAnalytics);
router.get('/enquiry-funnel', getEnquiryFunnel);
router.get('/activity', getRecentActivity);
router.get('/employee-performance', getEmployeePerformance);

module.exports = router;
