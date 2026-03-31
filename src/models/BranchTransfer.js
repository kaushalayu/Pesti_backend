const mongoose = require('mongoose');

const branchTransferSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  items: [{
    chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical', required: true },
    chemicalName: { type: String, required: true },
    category: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'L' },
    costRate: { type: Number, required: true },
    transferRate: { type: Number, required: true },
    costValue: { type: Number, required: true },
    transferValue: { type: Number, required: true }
  }],
  totalQuantity: { type: Number, required: true },
  totalCostValue: { type: Number, required: true },
  totalTransferValue: { type: Number, required: true },
  notes: { type: String },
  transferDate: { type: Date },
  status: { 
    type: String, 
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'], 
    default: 'PENDING' 
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acceptedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date },
  rejectReason: { type: String }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

branchTransferSchema.virtual('transferNo').get(function() {
  return `BT-${this._id.toString().slice(-8).toUpperCase()}`;
});

branchTransferSchema.index({ branchId: 1, status: 1 });
branchTransferSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BranchTransfer', branchTransferSchema);