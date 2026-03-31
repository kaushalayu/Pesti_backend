const express = require('express');
const {
  getMyInventory,
  useStock,
  returnStock,
  getMyUsageHistory
} = require('../controllers/employeeInventoryController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/my-inventory', getMyInventory);
router.post('/use', useStock);
router.post('/return', returnStock);
router.get('/usage-history', getMyUsageHistory);

module.exports = router;