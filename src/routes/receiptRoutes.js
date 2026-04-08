const express = require('express');
const {
  createReceipt,
  getReceipts,
  getReceipt,
  updateReceipt,
  downloadReceiptPdf,
  resendReceiptEmail,
  getReceiptStats,
  getPendingApprovals,
  generateFromForm,
  branchApproveReceipt,
  branchRejectReceipt,
  approveReceipt,
  rejectReceipt,
} = require('../controllers/receiptController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/stats', getReceiptStats);
router.get('/pending', getPendingApprovals);

router.post('/', createReceipt);
router.post('/from-form/:formId', generateFromForm);

router.route('/')
  .get(getReceipts);

router.route('/:id')
  .get(getReceipt)
  .patch(restrictTo('super_admin', 'branch_admin', 'office', 'technician', 'sales'), updateReceipt);

router.get('/:id/pdf', downloadReceiptPdf);
router.post('/:id/resend', resendReceiptEmail);

// Approval routes
router.patch('/:id/branch-approve', restrictTo('branch_admin'), branchApproveReceipt);
router.patch('/:id/branch-reject', restrictTo('branch_admin'), branchRejectReceipt);
router.patch('/:id/approve', restrictTo('super_admin'), approveReceipt);
router.patch('/:id/reject', restrictTo('super_admin', 'branch_admin'), rejectReceipt);

module.exports = router;
