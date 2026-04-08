const mongoose = require('mongoose');

const hqAccountSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['CREDIT', 'DEBIT'],
    required: true
  },
  source: {
    type: String,
    enum: ['RECEIPT', 'EXPENSE', 'EXPENSE_REIMBURSEMENT', 'PURCHASE', 'TRANSFER', 'BRANCH_PAYMENT', 'OTHER'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  relatedModel: {
    type: String,
    default: null
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    default: null
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

hqAccountSchema.index({ createdAt: -1 });
hqAccountSchema.index({ branchId: 1, createdAt: -1 });
hqAccountSchema.index({ source: 1, createdAt: -1 });

hqAccountSchema.statics.getBalance = async function() {
  const result = await this.aggregate([
    {
      $group: {
        _id: null,
        balance: {
          $sum: {
            $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', { $multiply: ['$amount', -1] }]
          }
        }
      }
    }
  ]);
  return result[0]?.balance || 0;
};

hqAccountSchema.statics.getSummaryBySource = async function() {
  return this.aggregate([
    {
      $group: {
        _id: '$source',
        total: { $sum: '$amount' }
      }
    }
  ]);
};

module.exports = mongoose.model('HQAccount', hqAccountSchema);
