const express = require('express');
const {
  createDistribution,
  getDistributions,
  getMyDistributions,
  updateDistribution,
  getDistributionStats,
  returnStock
} = require('../controllers/employeeDistributionController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', restrictTo('branch_admin', 'office'), createDistribution);
router.get('/', getDistributions);
router.get('/my-distributions', getMyDistributions);
router.get('/stats', restrictTo('branch_admin', 'office'), getDistributionStats);
router.patch('/:id/status', updateDistribution);
router.post('/return', returnStock);

module.exports = router;