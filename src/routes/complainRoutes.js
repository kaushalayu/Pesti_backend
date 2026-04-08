const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const {
  createComplain,
  getMyComplains,
  getAllComplains,
  assignComplain,
  getBranches,
  updateComplainStatus,
  getBranchUsers
} = require('../controllers/complainController');

const router = express.Router();

router.use(protect);

router.post('/', createComplain);
router.get('/my', getMyComplains);
router.get('/all', restrictTo('super_admin'), getAllComplains);
router.get('/branches', getBranches);
router.get('/branch-users', getBranchUsers);
router.put('/:id/assign', restrictTo('super_admin'), assignComplain);
router.put('/:id/status', updateComplainStatus);

module.exports = router;
