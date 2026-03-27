const express = require('express');
const {
  getOverviewStats,
  getRevenueAnalytics,
  getEnquiryFunnel,
  getRecentActivity,
} = require('../controllers/dashboardController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Strict: Only Super Admins and Branch Admins can view analytical dashboards
router.use(protect);
router.use(restrictTo('super_admin', 'branch_admin'));

router.get('/stats', getOverviewStats);
router.get('/revenue', getRevenueAnalytics);
router.get('/enquiry-funnel', getEnquiryFunnel);
router.get('/activity', getRecentActivity);

module.exports = router;
