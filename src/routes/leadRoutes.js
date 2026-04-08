const express = require('express');
const {
  createLead,
  getLeads,
  getLead,
  updateLead,
  assignLead,
  updateLeadStatus,
  addFollowUp,
  convertLead,
  getFollowUps,
  deleteLead,
  getLeadStats,
} = require('../controllers/leadController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Stats
router.get('/stats', getLeadStats);

// Follow-ups page data
router.get('/followups', getFollowUps);

// Standard CRUD
router.route('/')
  .post(createLead)
  .get(getLeads);

router.route('/:id')
  .get(getLead)
  .put(updateLead)
  .delete(deleteLead);

// Assignment
router.post('/:id/assign', assignLead);

// Status Updates
router.patch('/:id/status', updateLeadStatus);

// Convert to customer
router.post('/:id/convert', convertLead);

// Follow-up
router.post('/:id/followup', addFollowUp);

module.exports = router;