const express = require('express');
const {
  createRequest,
  getRequests,
  getMyRequests,
  updateRequest,
  deleteRequest
} = require('../controllers/purchaseRequestController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', createRequest);
router.get('/', getRequests);
router.get('/my-requests', getMyRequests);
router.patch('/:id/status', updateRequest);
router.delete('/:id', deleteRequest);

module.exports = router;
