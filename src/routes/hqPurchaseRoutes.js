const express = require('express');
const {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase
} = require('../controllers/hqPurchaseController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', restrictTo('super_admin'), createPurchase);
router.get('/', restrictTo('super_admin', 'branch_admin'), getPurchases);
router.get('/:id', getPurchaseById);
router.put('/:id', restrictTo('super_admin'), updatePurchase);
router.delete('/:id', restrictTo('super_admin'), deletePurchase);

module.exports = router;