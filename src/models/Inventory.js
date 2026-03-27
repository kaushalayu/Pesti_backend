const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical', required: true },
    
    // The owner of this stock. Can be a Branch or a User (Employee)
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    ownerType: { type: String, enum: ['Branch', 'User'], required: true },
    
    quantity: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Compound index for unique chemical per owner
inventorySchema.index({ chemicalId: 1, ownerId: 1 }, { unique: true });

module.exports = mongoose.model('Inventory', inventorySchema);
