const express = require('express');
const {
  getHQBalance,
  getDashboardSummary,
  getTransactions,
  getBranchLedger,
  recordOpeningBalance,
  recordAdjustment
} = require('../controllers/hqAccountController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(restrictTo('super_admin'));

router.get('/dashboard', getDashboardSummary);
router.get('/balance', getHQBalance);
router.get('/transactions', getTransactions);
router.get('/branch/:branchId', getBranchLedger);

router.post('/opening-balance', recordOpeningBalance);
router.post('/adjustment', recordAdjustment);

module.exports = router;
