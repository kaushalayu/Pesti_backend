const express = require('express');
const { 
  addChemical, 
  getChemicals, 
  assignStock, 
  reportUsage, 
  getInventory, 
  getTransactions,
  deleteChemical,
  deleteInventory
} = require('../controllers/inventoryController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use((req, res, next) => {
  console.log(`[InventoryRouter] Incoming: ${req.method} ${req.url}`);
  next();
});

router.use(protect); // Ensure user is logged in

// Root gets
router.get(['/', ''], getInventory);

// Specific routes
router.get('/chemicals', getChemicals);
router.post('/chemicals', restrictTo('super_admin'), addChemical);
router.delete('/chemicals/:id', restrictTo('super_admin'), deleteChemical);
router.post('/assign', restrictTo('super_admin', 'branch_admin'), assignStock);
router.post('/usage', reportUsage);
router.get('/transactions', getTransactions);
router.delete('/:id', restrictTo('super_admin'), deleteInventory);

module.exports = router;
