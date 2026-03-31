const mongoose = require('mongoose');
const { generateUniqueId } = require('../utils/generateId');

const stockTransferRequestSchema = new mongoose.Schema(
  {
    requestNo: { type: String, unique: true },
    txnType: { 
      type: String, 
      enum: ['SUPER_TO_BRANCH', 'BRANCH_TO_EMPLOYEE'], 
      required: true 
    },
    
    chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical', required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'L' },
    
    fromId: { type: mongoose.Schema.Types.ObjectId, required: true },
    fromType: { type: String, enum: ['super_admin', 'Branch'], required: true },
    
    toId: { type: mongoose.Schema.Types.ObjectId, required: true },
    toType: { type: String, enum: ['Branch', 'Employee'], required: true },
    
    purchaseRate: { type: Number, default: 0 },
    transferRate: { type: Number, required: true },
    totalValue: { type: Number, default: 0 },
    
    status: { 
      type: String, 
      enum: ['PENDING', 'APPROVED', 'REJECTED'], 
      default: 'PENDING' 
    },
    
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
    
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
    
    notes: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    
    isTransferred: { type: Boolean, default: false },
    transferredAt: { type: Date }
  },
  { timestamps: true }
);

stockTransferRequestSchema.pre('save', async function() {
  if (this.isNew && !this.requestNo) {
    this.requestNo = generateUniqueId('STR', 'REQ', '');
  }
  if (this.isModified('status') && this.status !== 'PENDING') {
    this.respondedAt = new Date();
  }
  if (this.status === 'APPROVED' && this.isTransferred === false) {
    this.isTransferred = true;
    this.transferredAt = new Date();
  }
});

stockTransferRequestSchema.index({ fromId: 1, status: 1 });
stockTransferRequestSchema.index({ toId: 1, status: 1 });
stockTransferRequestSchema.index({ chemicalId: 1 });

module.exports = mongoose.model('StockTransferRequest', stockTransferRequestSchema);
