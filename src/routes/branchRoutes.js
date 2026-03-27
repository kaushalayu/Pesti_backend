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

// The rest of the CRM module operations require super admin
router.use(restrictTo('super_admin'));

router.post('/', createBranch);
router.route('/:id').get(getBranch).put(updateBranch).delete(deleteBranch);
router.patch('/:id/status', toggleBranchStatus); // activate/deactivate

module.exports = router;
