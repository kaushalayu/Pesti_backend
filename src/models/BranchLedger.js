const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema(
  {
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
        'EMPLOYEE_COLLECTION',
        'STOCK_RECEIVED',
        'STOCK_DISTRIBUTED',
        'BRANCH_PAYMENT_TO_HQ',
        'EXPENSE_REIMBURSEMENT_PAID',
        'EXPENSE_SUBMITTED',
        'TRAVEL_ALLOWANCE_PAID',
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
      enum: ['Receipt', 'Expense', 'Payment', 'Collection', 'Inventory', 'StockTransfer', 'User', null],
      default: null
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

ledgerSchema.index({ branchId: 1, date: -1 });
ledgerSchema.index({ employeeId: 1, date: -1 });
ledgerSchema.index({ category: 1, date: -1 });

ledgerSchema.statics.getBranchBalance = async function(branchId) {
  const credits = await this.aggregate([
    { $match: { branchId: branchId, type: 'CREDIT' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const debits = await this.aggregate([
    { $match: { branchId: branchId, type: 'DEBIT' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  return {
    totalCredit: credits[0]?.total || 0,
    totalDebit: debits[0]?.total || 0,
    balance: (credits[0]?.total || 0) - (debits[0]?.total || 0)
  };
};

ledgerSchema.statics.getBranchSummary = async function(branchId) {
  const byCategory = await this.aggregate([
    { $match: { branchId: branchId } },
    {
      $group: {
        _id: { type: '$type', category: '$category' },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const employeeWise = await this.aggregate([
    { $match: { branchId: branchId, employeeId: { $ne: null } } },
    {
      $group: {
        _id: '$employeeId',
        credits: { $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] } },
        debits: { $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] } },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        employeeId: '$_id',
        employeeName: '$user.name',
        credits: 1,
        debits: 1,
        balance: { $subtract: ['$credits', '$debits'] },
        count: 1
      }
    },
    { $sort: { balance: -1 } }
  ]);

  return {
    byCategory,
    employeeWise,
    ...(await this.getBranchBalance(branchId))
  };
};

const BranchLedger = mongoose.model('BranchLedger', ledgerSchema);
module.exports = BranchLedger;
