const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { 
  getTravelLogs, 
  getMyActiveLog, 
  startTravel, 
  updateTravel, 
  endTravel, 
  cancelTravel,
  getPendingForAdmin,
  getAllTravelLogs,
  approveByBranchAdmin,
  approveBySuperAdmin,
  employeeAccept,
  getLinkedForms
} = require('../controllers/travelLogController');

const router = express.Router();

router.use(protect);

router.get('/', getTravelLogs);
router.get('/active', getMyActiveLog);
router.get('/forms', getLinkedForms);
router.get('/pending', getPendingForAdmin);
router.get('/all', restrictTo('super_admin', 'branch_admin'), getAllTravelLogs);
router.post('/start', startTravel);
router.put('/:id', updateTravel);
router.post('/:id/end', endTravel);
router.post('/:id/branch-approve', restrictTo('branch_admin', 'super_admin'), approveByBranchAdmin);
router.post('/:id/super-approve', restrictTo('super_admin', 'branch_admin'), approveBySuperAdmin);
router.post('/:id/accept', employeeAccept);
router.delete('/:id', cancelTravel);

module.exports = router;
