const mongoose = require('mongoose');
const { generateAutoId } = require('../utils/autoId');
const Branch = require('./Branch');

const amcSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerAddress: { type: String },
  serviceType: { type: String, required: true },
  premisesType: { type: String },
  contractNo: { type: String, unique: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  period: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'RENEWED'], default: 'ACTIVE' },
  servicesIncluded: [{ type: String }],
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  renewalReminder: { type: Date },
  notes: { type: String },
}, { timestamps: true });

amcSchema.pre('save', function(next) {
  this.balanceAmount = this.totalAmount - this.paidAmount;
  next();
});

amcSchema.pre('validate', async function () {
  if (this.isNew && !this.contractNo && this.branchId) {
    try {
      const branch = await Branch.findById(this.branchId);
      if (branch && branch.cityPrefix) {
        const year = new Date().getFullYear();
        this.contractNo = await generateAutoId(
          mongoose.model('AMC'),
          `AMC-${branch.cityPrefix}-${year}`,
          'contractNo',
          4
        );
      }
    } catch (error) {
      console.error('Error generating contract number:', error.message);
    }
  }
});

module.exports = mongoose.model('AMC', amcSchema);
