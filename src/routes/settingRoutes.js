const express = require('express');
const { 
  getSetting, 
  getAllSettings, 
  setSetting, 
  deleteSetting,
  getAttDropdowns,
  updateAttDropdowns
} = require('../controllers/settingController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/att-dropdowns', getAttDropdowns);
router.put('/att-dropdowns', updateAttDropdowns);

router.use(restrictTo('super_admin'));

router.get('/', getAllSettings);
router.get('/:key', getSetting);
router.put('/:key', setSetting);
router.delete('/:key', deleteSetting);

module.exports = router;