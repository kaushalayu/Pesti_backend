const mongoose = require('mongoose');

const distributionSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical', required: true },
    chemicalName: { type: String },
    category: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'L' },
    bottles: { type: Number, default: 0 },
    rate: { type: Number, required: true },
    value: { type: Number, required: true },
    returnedQty: { type: Number, default: 0 }
  }],
  totalQuantity: { type: Number, required: true },
  totalValue: { type: Number, required: true },
  notes: { type: String },
  status: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'DISTRIBUTED', 'PARTIALLY_RETURNED', 'FULLY_RETURNED', 'REJECTED'], 
    default: 'PENDING' 
  },
  distributedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  distributedAt: { type: Date },
  returnedAt: { type: Date }
}, { timestamps: true });

distributionSchema.index({ branchId: 1, employeeId: 1 });
distributionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Distribution', distributionSchema);