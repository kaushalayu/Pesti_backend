const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const {
  getUnassignedBookings,
  getAllBookingsWithAssignments,
  getEmployeeWorkload,
  getAvailableEmployees,
  assignTask,
  acceptTask,
  declineTask,
  completeTask,
  getMyTasks,
  getTaskHistory,
  getAllAssignments,
  reAssignTask,
  cancelAssignment,
  getTasksByDate
} = require('../controllers/taskAssignmentController');

router.use(protect);

router.get('/unassigned-bookings', getUnassignedBookings);
router.get('/all-bookings', getAllBookingsWithAssignments);
router.get('/employee-workload', getEmployeeWorkload);
router.get('/available-employees', getAvailableEmployees);
router.get('/by-date', getTasksByDate);
router.get('/my-tasks', getMyTasks);
router.get('/my-history', getTaskHistory);
router.get('/', getAllAssignments);

router.post('/', restrictTo('super_admin', 'branch_admin'), assignTask);
router.patch('/:id/accept', acceptTask);
router.patch('/:id/decline', declineTask);
router.patch('/:id/complete', completeTask);
router.patch('/:id/reassign', restrictTo('super_admin', 'branch_admin'), reAssignTask);
router.patch('/:id/cancel', restrictTo('super_admin', 'branch_admin'), cancelAssignment);

module.exports = router;
