const express = require('express');
const {
  createForm,
  getForms,
  getForm,
  updateForm,
  submitForm,
  updateFormStatus,
  downloadFormPdf,
  getFormStats,
} = require('../controllers/formController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect); // Ensure user is logged in

// Stats comes first to avoid being treated as :id param
router.get('/stats', restrictTo('super_admin', 'branch_admin'), getFormStats);

router.route('/')
  .post(createForm) // Employees, Admins
  .get(getForms); // Employee sees theirs, admin sees branch, super sees all

router.route('/:id')
  .get(getForm)
  .put(updateForm);

// Status overrides
router.post('/:id/submit', submitForm);
router.patch('/:id/status', updateFormStatus); // E.g., moving to SCHEDULED, COMPLETED
router.get('/:id/pdf', downloadFormPdf);

module.exports = router;
