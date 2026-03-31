const mongoose = require('mongoose');
const { generateUniqueId } = require('../utils/generateId');
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
  servicesPerMonth: { type: Number, default: 1 },
  totalServices: { type: Number, required: true },
  interval: { type: Number, default: 30 },
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'RENEWED'], default: 'ACTIVE' },
  servicesIncluded: [{ type: String }],
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  formId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceForm' },
  renewalReminder: { type: Date },
  notes: { type: String },
}, { timestamps: true });

amcSchema.index({ branchId: 1, status: 1 });
amcSchema.index({ customerId: 1 });
amcSchema.index({ customerPhone: 1 });
amcSchema.index({ status: 1, endDate: 1 });
amcSchema.index({ formId: 1 });

amcSchema.pre('save', function(next) {
  this.balanceAmount = this.totalAmount - this.paidAmount;
  next();
});

amcSchema.pre('validate', async function () {
  if (this.isNew && !this.contractNo && this.branchId && this.employeeId) {
    try {
      const branch = await Branch.findById(this.branchId).select('branchCode');
      const User = mongoose.model('User');
      const user = await User.findById(this.employeeId).select('employeeId');
      
      const branchCode = branch?.branchCode?.replace(/-/g, '').substring(0, 3) || 'HQ';
      const empCode = user?.employeeId?.replace(/-/g, '').substring(0, 3) || 'S00';
      
      this.contractNo = generateUniqueId('AMC', branchCode, empCode);
    } catch (error) {
      console.error('Error generating contract number:', error.message);
    }
  }
});

module.exports = mongoose.model('AMC', amcSchema);
