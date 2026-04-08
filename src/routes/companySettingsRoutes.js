const express = require('express');
const {
  getCompanySettings,
  updateCompanySettings
} = require('../controllers/companySettingsController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', getCompanySettings);
router.put('/', restrictTo('super_admin'), updateCompanySettings);

module.exports = router;
