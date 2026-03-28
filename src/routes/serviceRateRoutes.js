const express = require('express');
const {
  createServiceRate,
  getServiceRates,
  getRateByService,
  updateServiceRate,
  deleteServiceRate,
  getAllServiceRatesAdmin
} = require('../controllers/serviceRateController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/lookup', getRateByService);
router.get('/', getServiceRates);
router.get('/admin', restrictTo('super_admin', 'branch_admin'), getAllServiceRatesAdmin);

router.post('/', restrictTo('super_admin', 'branch_admin'), createServiceRate);
router.put('/:id', restrictTo('super_admin', 'branch_admin'), updateServiceRate);
router.delete('/:id', restrictTo('super_admin', 'branch_admin'), deleteServiceRate);

module.exports = router;
