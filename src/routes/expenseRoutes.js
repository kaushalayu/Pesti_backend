const express = require('express');
const {
  createExpense,
  getExpenses,
  getExpenseStats,
  updateExpenseStatus,
  deleteExpense,
  getExpenseById,
} = require('../controllers/expenseController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/stats', getExpenseStats);

router.route('/')
  .get(getExpenses)
  .post(createExpense);

router.get('/:id', getExpenseById);

router.patch('/:id/status', restrictTo('super_admin', 'branch_admin', 'office'), updateExpenseStatus);
router.delete('/:id', deleteExpense);

module.exports = router;
