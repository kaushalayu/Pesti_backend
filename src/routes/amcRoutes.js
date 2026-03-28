const express = require('express');
const { 
  createAMC, 
  getAMCs, 
  getAMC, 
  updateAMC, 
  renewAMC,
  deleteAMC,
  getExpiringAMCs
} = require('../controllers/amcController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/expiring', restrictTo('super_admin', 'branch_admin'), getExpiringAMCs);

router.route('/')
  .post(createAMC)
  .get(getAMCs);

router.route('/:id')
  .get(getAMC)
  .put(updateAMC)
  .delete(restrictTo('super_admin'), deleteAMC);

router.post('/:id/renew', renewAMC);

module.exports = router;
