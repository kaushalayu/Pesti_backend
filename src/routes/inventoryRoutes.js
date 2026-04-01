const express = require('express');
const { 
  getChemicals,
  addChemical, 
  updateChemical,
  deleteChemical,
  purchaseStock,
  addStock,
  recordUsage,
  getInventory,
  getTransactions,
  getMyWallet,
  deleteInventory,
  getBranchBalances,
  getMyBalance
} = require('../controllers/inventoryController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', getInventory);
router.get('/chemicals', getChemicals);
router.get('/transactions', getTransactions);
router.get('/wallet', getMyWallet);
router.get('/balances', restrictTo('super_admin'), getBranchBalances);
router.get('/my-balance', getMyBalance);

router.post('/chemicals', restrictTo('super_admin'), addChemical);
router.put('/chemicals/:id', restrictTo('super_admin'), updateChemical);
router.delete('/chemicals/:id', restrictTo('super_admin'), deleteChemical);

router.post('/purchase', restrictTo('super_admin'), purchaseStock);
router.post('/add-stock', restrictTo('super_admin'), addStock);
router.post('/transfer-to-branch', restrictTo('super_admin'), (req, res, next) => {
  res.status(400).json({ 
    success: false, 
    message: 'Direct transfer is disabled. Please use the new Stock Transfer system with approval workflow.'
  });
});

router.post('/transfer-to-employee', restrictTo('super_admin', 'branch_admin', 'office'), (req, res, next) => {
  res.status(400).json({ 
    success: false, 
    message: 'Direct transfer is disabled. Please use the new Stock Transfer system with approval workflow.'
  });
});
router.post('/usage', recordUsage);

router.delete('/:id', restrictTo('super_admin'), deleteInventory);

module.exports = router;
