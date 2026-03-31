const express = require('express');
const {
  createBranch,
  getBranches,
  getBranch,
  updateBranch,
  toggleBranchStatus,
  getBranchStats,
  deleteBranch,
} = require('../controllers/branchController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Require auth for all branch routes
router.use(protect);

// Allow branch viewing & stats to specific roles
router.get('/', restrictTo('super_admin', 'branch_admin', 'technician', 'sales', 'office'), getBranches);
router.get('/:id/stats', restrictTo('super_admin', 'branch_admin'), getBranchStats);

// Allow branch admin to manage their own branch
router.post('/', restrictTo('super_admin', 'branch_admin'), createBranch);
router.route('/:id').get(getBranch).put(restrictTo('super_admin', 'branch_admin'), updateBranch).delete(restrictTo('super_admin'), deleteBranch);
router.patch('/:id/status', restrictTo('super_admin', 'branch_admin'), toggleBranchStatus); // activate/deactivate

module.exports = router;
