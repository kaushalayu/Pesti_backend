const mongoose = require('mongoose');
const { generateAutoId } = require('../utils/autoId');

const purchaseRequestSchema = new mongoose.Schema(
  {
    requestNo: { type: String, unique: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    items: [{
      chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical', required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, default: 'L' }
    }],
    
    totalValue: { type: Number, default: 0 },
    
    status: { 
      type: String, 
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'], 
      default: 'PENDING' 
    },
    
    notes: { type: String, default: '' },
    adminNotes: { type: String, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

purchaseRequestSchema.pre('validate', async function () {
  if (this.isNew && !this.requestNo) {
    try {
      this.requestNo = await generateAutoId(this.constructor, 'REQ', 'requestNo', 3);
    } catch (error) {
      throw error;
    }
  }
});

module.exports = mongoose.model('PurchaseRequest', purchaseRequestSchema);
