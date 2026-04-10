const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical', required: true },
    
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    ownerType: { type: String, enum: ['Branch', 'Employee'], required: true },
    
    quantity: { type: Number, default: 0 },
    unit: { type: String, default: 'L' },
    
    bottles: { type: Number, default: 0 },
    bottleSize: { type: Number, default: 1 }, // in liters
    
    unitPrice: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 },
    
    originalQuantity: { type: Number, default: 0 },
    usedQuantity: { type: Number, default: 0 },
    returnedQuantity: { type: Number, default: 0 },
    
    purchaseRate: { type: Number, default: 0 },
    transferRate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

inventorySchema.index({ chemicalId: 1, ownerId: 1 }, { unique: true });
inventorySchema.index({ ownerId: 1, ownerType: 1 });

inventorySchema.pre('save', function() {
  this.totalValue = Math.round(this.quantity * this.transferRate * 100) / 100;
});

module.exports = mongoose.model('Inventory', inventorySchema);
