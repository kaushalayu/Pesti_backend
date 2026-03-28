const mongoose = require('mongoose');
const { generateAutoId } = require('../utils/autoId');
const Branch = require('./Branch');

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, unique: true },
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

customerSchema.pre('validate', async function () {
  if (this.isNew && !this.customerId && this.branchId) {
    try {
      const branch = await Branch.findById(this.branchId);
      if (branch && branch.cityPrefix) {
        const year = new Date().getFullYear();
        this.customerId = await generateAutoId(
          mongoose.model('Customer'),
          `CUST-${branch.cityPrefix}-${year}`,
          'customerId',
          4
        );
      }
    } catch (error) {
      console.error('Error generating customer ID:', error.message);
    }
  }
});

module.exports = mongoose.model('Customer', customerSchema);
