const mongoose = require('mongoose');

const hqPurchaseSchema = new mongoose.Schema({
  items: [{
    chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical', required: true },
    chemicalName: { type: String, required: true },
    category: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'L' },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true },
    transferredQty: { type: Number, default: 0 }
  }],
  supplierName: { type: String, default: 'Direct Purchase' },
  supplierContact: { type: String },
  invoiceNo: { type: String },
  notes: { type: String },
  totalQuantity: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['ACTIVE', 'PARTIAL', 'EXHAUSTED'], default: 'ACTIVE' }
}, { timestamps: true });

hqPurchaseSchema.index({ createdAt: -1 });
hqPurchaseSchema.index({ purchasedBy: 1 });

module.exports = mongoose.model('HQPurchase', hqPurchaseSchema);