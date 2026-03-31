const mongoose = require('mongoose');

const hqAccountSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['INCOME', 'EXPENSE'],
      required: true
    },
    source: {
      type: String,
      enum: [
        'BRANCH_STOCK_PAYMENT',
        'CUSTOMER_RECEIPT',
        'EXPENSE_REIMBURSEMENT',
        'STOCK_PURCHASE',
        'OPENING_BALANCE',
        'ADJUSTMENT'
      ],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    balanceAfter: {
      type: Number,
      default: 0
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedModel'
    },
    relatedModel: {
      type: String,
      enum: ['Branch', 'Receipt', 'Expense', 'User', 'Payment', null],
      default: null
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null
    },
    description: {
      type: String,
      default: ''
    },
    paymentMode: {
      type: String,
      enum: ['CASH', 'BANK', 'UPI', 'NEFT', 'RTGS', 'CHEQUE', 'ONLINE', 'WALLET', 'ADJUSTMENT', null],
      default: null
    },
    transactionRef: {
      type: String,
      default: null
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

hqAccountSchema.index({ source: 1, date: -1 });
hqAccountSchema.index({ branchId: 1, date: -1 });
hqAccountSchema.index({ customerId: 1 });
hqAccountSchema.index({ type: 1 });

hqAccountSchema.statics.getBalance = async function() {
  const income = await this.aggregate([
    { $match: { type: 'INCOME' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const expense = await this.aggregate([
    { $match: { type: 'EXPENSE' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const incomeTotal = income[0]?.total || 0;
  const expenseTotal = expense[0]?.total || 0;
  
  return {
    totalIncome: incomeTotal,
    totalExpense: expenseTotal,
    balance: incomeTotal - expenseTotal
  };
};

hqAccountSchema.statics.getBalanceByBranch = async function(branchId) {
  const customerReceipts = await this.aggregate([
    { $match: { branchId: branchId, source: 'CUSTOMER_RECEIPT' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const branchPayments = await this.aggregate([
    { $match: { branchId: branchId, source: 'BRANCH_STOCK_PAYMENT' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const pending = (customerReceipts[0]?.total || 0) - (branchPayments[0]?.total || 0);
  
  return {
    customerReceipts: customerReceipts[0]?.total || 0,
    branchPayments: branchPayments[0]?.total || 0,
    pending: pending
  };
};

hqAccountSchema.statics.getSummaryBySource = async function() {
  const sources = await this.aggregate([
    {
      $group: {
        _id: '$source',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  return sources.reduce((acc, s) => {
    acc[s._id] = { total: s.total, count: s.count };
    return acc;
  }, {});
};

module.exports = mongoose.model('HQAccount', hqAccountSchema);
