const express = require('express');
const { 
  createTransferRequest,
  getTransferRequests,
  approveTransferRequest,
  rejectTransferRequest,
  getMyTransferStats
} = require('../controllers/stockTransferController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', restrictTo('super_admin', 'branch_admin', 'office'), createTransferRequest);

router.get('/', getTransferRequests);

router.get('/stats', restrictTo('super_admin', 'branch_admin', 'office'), getMyTransferStats);

router.patch('/:id/approve', approveTransferRequest);

router.patch('/:id/reject', restrictTo('super_admin', 'branch_admin', 'office', 'technician', 'sales'), rejectTransferRequest);

module.exports = router;
