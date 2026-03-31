const mongoose = require('mongoose');
const { generateUniqueId } = require('../utils/generateId');

const inventoryTransactionSchema = new mongoose.Schema(
  {
    txnId: { type: String, unique: true },
    txnType: { 
      type: String, 
      enum: ['PURCHASE', 'TRANSFER_TO_BRANCH', 'TRANSFER_TO_EMPLOYEE', 'USAGE', 'RETURN', 'STOCK_ADJUSTMENT', 'PAYMENT'], 
    },
    chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical' },
    
    fromId: { type: mongoose.Schema.Types.ObjectId },
    fromType: { type: String, enum: ['super_admin', 'Branch', 'Employee', 'supplier'] },
    
    toId: { type: mongoose.Schema.Types.ObjectId },
    toType: { type: String, enum: ['super_admin', 'Branch', 'Employee', 'Usage'] },
    
    quantity: { type: Number, default: 0 },
    unit: { type: String, default: 'L' },
    purchaseRate: { type: Number, default: 0 },
    transferRate: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 },
    
    type: { 
      type: String, 
      enum: ['STOCK_ADD', 'ASSIGNED', 'USAGE', 'RETURNED', 'PAYMENT', 'PURCHASE', 'TRANSFER'], 
    },
    
    jobId: { type: String },
    jobName: { type: String },
    linkedFormId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceForm' },
    
    notes: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    returnedQuantity: { type: Number, default: 0 },
    
    invoicePhotoUrl: { type: String },
    invoiceNo: { type: String },
    purchaseDate: { type: Date },
    
    supplierName: { type: String },
    supplierContact: { type: String },
  },
  { timestamps: true }
);

inventoryTransactionSchema.pre('save', async function() {
  if (this.isNew && !this.txnId) {
    this.txnId = generateUniqueId('TXN', 'INV', '');
  }
  if (this.unitPrice) {
    this.totalValue = Math.round(this.quantity * this.unitPrice * 100) / 100;
  }
});

inventoryTransactionSchema.index({ chemicalId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ txnType: 1 });
inventoryTransactionSchema.index({ linkedFormId: 1 });
inventoryTransactionSchema.index({ fromId: 1, txnType: 1, createdAt: -1 });
inventoryTransactionSchema.index({ toId: 1, txnType: 1, createdAt: -1 });
inventoryTransactionSchema.index({ ownerId: 1, ownerType: 1, createdAt: -1 });
inventoryTransactionSchema.index({ txnType: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
