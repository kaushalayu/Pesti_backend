const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true
    },
    type: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true
    },
    category: {
      type: String,
      enum: [
        'CUSTOMER_RECEIPT',
        'COLLECTION',
        'EXPENSE_SUBMITTED',
        'EXPENSE_APPROVED',
        'EXPENSE_REJECTED',
        'TRAVEL_ALLOWANCE',
        'STOCK_RECEIVED',
        'STOCK_DISTRIBUTED',
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
      type: mongoose.Schema.Types.ObjectId
    },
    relatedModel: {
      type: String,
      enum: ['Receipt', 'Expense', 'Collection', 'Inventory', 'StockTransfer', 'TravelLog', 'TaskAssignment', 'ServiceForm', null],
      default: null
    },
    description: {
      type: String,
      default: ''
    },
    paymentMode: {
      type: String,
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

ledgerSchema.index({ userId: 1, date: -1 });
ledgerSchema.index({ branchId: 1, date: -1 });
ledgerSchema.index({ type: 1, date: -1 });

ledgerSchema.statics.getUserBalance = async function(userId) {
  const credits = await this.aggregate([
    { $match: { userId: userId, type: 'CREDIT' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const debits = await this.aggregate([
    { $match: { userId: userId, type: 'DEBIT' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  return {
    totalCredit: credits[0]?.total || 0,
    totalDebit: debits[0]?.total || 0,
    balance: (credits[0]?.total || 0) - (debits[0]?.total || 0)
  };
};

ledgerSchema.statics.getUserSummary = async function(userId) {
  const byCategory = await this.aggregate([
    { $match: { userId: userId } },
    {
      $group: {
        _id: { type: '$type', category: '$category' },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const credits = byCategory.filter(c => c._id.type === 'CREDIT');
  const debits = byCategory.filter(c => c._id.type === 'DEBIT');

  return {
    credits,
    debits,
    ...(await this.getUserBalance(userId))
  };
};

ledgerSchema.statics.getUserTransactions = async function(userId, limit = 50) {
  return this.find({ userId })
    .sort('-createdAt')
    .limit(limit);
};

const EmployeeLedger = mongoose.model('EmployeeLedger', ledgerSchema);
module.exports = EmployeeLedger;
