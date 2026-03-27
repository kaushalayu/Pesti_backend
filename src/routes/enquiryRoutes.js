const express = require('express');
const {
  createEnquiry,
  getEnquiries,
  getEnquiry,
  updateEnquiry,
  updateEnquiryStatus,
  getEnquiryStats,
  exportEnquiriesPdf,
  exportEnquiriesCSV,
} = require('../controllers/enquiryController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect); // Ensure secure session

// Analytics & Reports (must appear before /:id routes)
router.get('/stats', restrictTo('super_admin', 'branch_admin'), getEnquiryStats);
router.get('/export/pdf', restrictTo('super_admin', 'branch_admin', 'office'), exportEnquiriesPdf);
router.get('/export/sheets', restrictTo('super_admin', 'branch_admin', 'office'), exportEnquiriesCSV);

// Standard CRUD
router.route('/')
  .post(createEnquiry) // Any authenticated app user can lodge a lead. 
  .get(getEnquiries); // Scope mapping is handled in controller logic.

router.route('/:id')
  .get(getEnquiry)
  .put(updateEnquiry); // Full structural update 

// Status Updates via Quick Buttons in App 
router.patch('/:id/status', updateEnquiryStatus);

module.exports = router;
