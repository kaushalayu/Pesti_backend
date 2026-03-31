const express = require('express');
const { 
  addPayment, 
  getPayments, 
  getPaymentSummary,
  getBranchHQSummary,
  deletePayment 
} = require('../controllers/paymentController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use((req, res, next) => {
  console.log(`[PaymentRouter] ${req.method} ${req.url}`);
  next();
});

router.use(protect);

router.post('/', restrictTo('super_admin'), addPayment);
router.get('/', getPayments);
router.get('/hq-summary', getBranchHQSummary);
router.get('/summary', restrictTo('super_admin'), getPaymentSummary);
router.delete('/:id', restrictTo('super_admin'), deletePayment);

module.exports = router;
