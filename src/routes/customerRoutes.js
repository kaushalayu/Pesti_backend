const express = require('express');
const { 
  createCustomer, 
  getCustomers, 
  getCustomer, 
  updateCustomer, 
  deleteCustomer 
} = require('../controllers/customerController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .post(createCustomer)
  .get(getCustomers);

router.route('/:id')
  .get(getCustomer)
  .put(updateCustomer)
  .delete(restrictTo('super_admin', 'branch_admin'), deleteCustomer);

module.exports = router;
