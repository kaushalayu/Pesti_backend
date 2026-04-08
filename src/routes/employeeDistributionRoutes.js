const express = require('express');
const {
  createDistribution,
  getDistributions,
  getMyDistributions,
  updateDistribution,
  getDistributionStats,
  returnStock,
  approveDistribution,
  rejectDistribution
} = require('../controllers/employeeDistributionController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', restrictTo('branch_admin', 'office', 'employee', 'technician', 'sales'), createDistribution);
router.get('/', getDistributions);
router.get('/my-distributions', getMyDistributions);
router.get('/stats', restrictTo('branch_admin', 'office'), getDistributionStats);
router.patch('/:id/status', updateDistribution);
router.post('/return', returnStock);
router.post('/:id/approve', restrictTo('employee', 'technician', 'sales'), approveDistribution);
router.post('/:id/reject', restrictTo('employee', 'technician', 'sales'), rejectDistribution);

module.exports = router;