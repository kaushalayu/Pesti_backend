const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    
    amount: { type: Number, required: true },
    
    paymentMethod: { 
      type: String, 
      enum: ['UPI', 'NEFT', 'RTGS', 'Cash', 'Cheque', 'Bank Transfer', 'Other'],
      required: true 
    },
    
    transactionId: { type: String },
    
    paidAt: { type: Date, default: Date.now },
    
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    notes: { type: String },
    
    balanceAfter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

paymentSchema.index({ branchId: 1, createdAt: -1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ recordedBy: 1 });
paymentSchema.index({ paidAt: -1 });
paymentSchema.index({ branchId: 1, paidAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
