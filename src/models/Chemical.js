const mongoose = require('mongoose');

const chemicalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    unit: { type: String, required: true }, // e.g., Liters, Grams, Kg
    description: { type: String },
    mainStock: { type: Number, default: 0 }, // Admin's global stock
  },
  { timestamps: true }
);

module.exports = mongoose.model('Chemical', chemicalSchema);
