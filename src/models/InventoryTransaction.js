const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema(
  {
    chemicalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chemical', required: true },
    
    // Who gave (can be null for initial admin stock)
    fromId: { type: mongoose.Schema.Types.ObjectId },
    fromType: { type: String, enum: ['Admin', 'Branch', 'User'] },
    
    // Who received (can be null for usage)
    toId: { type: mongoose.Schema.Types.ObjectId },
    toType: { type: String, enum: ['Branch', 'User', 'Usage'] },
    
    quantity: { type: Number, required: true },
    type: { 
      type: String, 
      enum: ['STOCK_ADD', 'ASSIGNED', 'USAGE', 'RETURNED'], 
      required: true 
    },
    
    notes: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who performed this action
  },
  { timestamps: true }
);

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
