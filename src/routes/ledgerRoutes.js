const express = require('express');
const {
  getMyLedger,
  getMyBalance,
  getBranchLedger,
  getBranchBalance,
  getHQAccount,
  getHQTransactions,
  recordOpeningBalance
} = require('../controllers/ledgerController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Employee routes
router.get('/me', getMyLedger);
router.get('/me/balance', getMyBalance);

// Branch routes (Branch Admin & Super Admin)
router.get('/branch', getBranchLedger);
router.get('/branch/:branchId', getBranchLedger);
router.get('/branch-balance', getBranchBalance);
router.get('/branch-balance/:branchId', getBranchBalance);

// HQ routes (Super Admin only)
router.get('/hq', getHQAccount);
router.get('/hq/transactions', restrictTo('super_admin'), getHQTransactions);

// Opening balance (role-based)
router.post('/opening-balance', recordOpeningBalance);

module.exports = router;
