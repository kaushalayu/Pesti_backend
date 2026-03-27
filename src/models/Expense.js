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
    
    date: {
      type: Date,
      default: Date.now,
    },
    
    // Admin can approve/reject
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    receiptNote: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
