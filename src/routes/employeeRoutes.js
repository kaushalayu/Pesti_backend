const express = require('express');
const {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  adminResetPassword,
  getEmployeeActivity,
  deleteEmployee,
} = require('../controllers/employeeController');
const { protect, restrictTo } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// All employee routes strictly require authentication
router.use(protect);

// Only Super Admins and Branch Admins can manage employees
router.use(restrictTo('super_admin', 'branch_admin'));

router
  .route('/')
  .post(upload.single('profileImage'), createEmployee)
  .get(getEmployees);

router
  .route('/:id')
  .get(getEmployee)
  .put(upload.single('profileImage'), updateEmployee)
  .delete(deleteEmployee);

router.post('/:id/reset-password', adminResetPassword);

router.get('/:id/activity', getEmployeeActivity);

module.exports = router;
