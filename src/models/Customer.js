const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    title: { type: String, enum: ['Mr', 'Mrs', 'Ms', 'Dr', 'M/s', ''], default: '' },
    address: { type: String, required: true },
    city: { type: String, required: true },
    gstNo: { type: String, default: '' },
    phone: { type: String, required: true },
    whatsapp: { type: String, default: '' },
    email: { type: String, default: '' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
