const express = require('express');
const {
  createExpense,
  getExpenses,
  getExpenseStats,
  updateExpenseStatus,
  deleteExpense,
} = require('../controllers/expenseController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Stats route must come BEFORE /:id routes
router.get('/stats', restrictTo('super_admin', 'branch_admin'), getExpenseStats);

router.route('/')
  .get(getExpenses)
  .post(createExpense);

router.patch('/:id/status', restrictTo('super_admin', 'branch_admin'), updateExpenseStatus);
router.delete('/:id', deleteExpense);

module.exports = router;
