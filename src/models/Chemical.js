const mongoose = require('mongoose');

const chemicalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sku: { type: String },
    category: { type: String, enum: ['Insecticide', 'Herbicide', 'Fungicide', 'Rodenticide', 'Others'], default: 'Others' },
    unit: { type: String, required: true },
    description: { type: String },
    mainStock: { type: Number, default: 0 },
    bottles: { type: Number, default: 0 },
    bottleSize: { type: Number, default: 1 },
    purchasePrice: { type: Number, default: 0 },
    branchPrice: { type: Number, default: 0 },
    unitSystem: { 
      type: String, 
      enum: ['L', 'ML', 'KG', 'G'], 
      default: 'L' 
    },
    minStockLevel: { type: Number, default: 10 },
    expiryDate: { type: Date },
    manufacturer: { type: String },
    supplier: {
      name: { type: String },
      contact: { type: String },
      gstNo: { type: String }
    },
    lastPurchaseDate: { type: Date },
    lastPurchaseRate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

chemicalSchema.pre('save', async function() {
  if (this.purchasePrice > 0) {
    this.branchPrice = Math.round(this.purchasePrice * 1.10 * 100) / 100;
  }
});

chemicalSchema.pre('findOneAndUpdate', async function() {
  const update = this.getUpdate();
  if (update.purchasePrice && update.purchasePrice > 0) {
    update.branchPrice = Math.round(update.purchasePrice * 1.10 * 100) / 100;
  }
});

module.exports = mongoose.model('Chemical', chemicalSchema);
