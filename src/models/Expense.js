const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    
    category: {
      type: String,
      enum: ['Travel', 'Food', 'Materials', 'Equipment', 'Communication', 'Miscellaneous'],
      required: true,
    },
    
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount cannot be negative'],
    },
    
    description: {
      type: String,
      required: true,
      trim: true,
    },
    
    billDate: {
      type: Date,
      default: Date.now,
    },
    
    billPhoto: {
      type: String,
      default: null,
    },
    
    status: {
      type: String,
      enum: ['PENDING_BRANCH', 'PENDING_HQ', 'APPROVED', 'REJECTED'],
      default: 'PENDING_BRANCH',
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    approvedAt: {
      type: Date,
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    reviewedAt: {
      type: Date,
    },

    receiptNote: { type: String },

    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

expenseSchema.index({ employeeId: 1, status: 1 });
expenseSchema.index({ branchId: 1, status: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ billDate: -1 });
expenseSchema.index({ branchId: 1, billDate: -1 });
expenseSchema.index({ employeeId: 1, billDate: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
