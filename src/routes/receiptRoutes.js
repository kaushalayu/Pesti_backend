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
} = require('../controllers/receiptController');
const { protect, restrictTo } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/stats', getReceiptStats);
router.get('/pending', getPendingApprovals);

router.post('/', upload.single('paymentScreenshot'), createReceipt);
router.post('/from-form/:formId', upload.single('paymentScreenshot'), generateFromForm);

router.route('/')
  .get(getReceipts);

router.route('/:id')
  .get(getReceipt)
  .patch(restrictTo('super_admin', 'branch_admin', 'office', 'technician', 'sales'), updateReceipt);

router.get('/:id/pdf', downloadReceiptPdf);
router.post('/:id/resend', resendReceiptEmail);

module.exports = router;
