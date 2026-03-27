const express = require('express');
const {
  createReceipt,
  getReceipts,
  getReceipt,
  updateReceipt,
  downloadReceiptPdf,
  resendReceiptEmail,
  getReceiptStats,
} = require('../controllers/receiptController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Require login for all receipt routes
router.use(protect);

router.get('/stats', restrictTo('super_admin', 'branch_admin'), getReceiptStats);

router.route('/')
  .post(createReceipt)
  .get(getReceipts);

router.route('/:id')
  .get(getReceipt)
  .patch(restrictTo('super_admin', 'branch_admin'), updateReceipt); // Only admins should tweak numbers

// Actions
router.get('/:id/pdf', downloadReceiptPdf);
router.post('/:id/resend', resendReceiptEmail);

module.exports = router;
