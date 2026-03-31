const express = require('express');
const {
  createBranchTransfer,
  getBranchTransfers,
  getBranchTransferById,
  approveBranchTransfer,
  rejectBranchTransfer,
  getBranchTransferStats
} = require('../controllers/branchTransferController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', restrictTo('super_admin'), createBranchTransfer);
router.get('/', getBranchTransfers);
router.get('/stats', restrictTo('super_admin', 'branch_admin'), getBranchTransferStats);
router.get('/:id', getBranchTransferById);
router.patch('/:id/approve', restrictTo('branch_admin'), approveBranchTransfer);
router.patch('/:id/reject', restrictTo('branch_admin'), rejectBranchTransfer);

module.exports = router;