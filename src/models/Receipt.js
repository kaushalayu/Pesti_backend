const mongoose = require('mongoose');
const { generateAutoId } = require('../utils/autoId');
const Branch = require('./Branch');

const receiptSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, unique: true },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceForm' }, // Optional link
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, // Optional link
    
    // Denormalized customer data in case customer is deleted or missing
    customerName: { type: String, required: true },
    customerEmail: { type: String },
    customerPhone: { type: String },
    
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    serviceDescription: { type: String, required: true },
    
    amount: { type: Number, required: true },
    advancePaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 }, // Computed field
    
    paymentMode: { 
      type: String, 
      enum: ['CASH', 'CHEQUE', 'NEFT', 'ONLINE'], 
      required: true 
    },
    paymentDate: { type: Date, default: Date.now },
    chequeNo: { type: String },
    
    status: { 
      type: String, 
      enum: ['PENDING', 'PARTIAL', 'PAID'], 
      default: 'PAID' 
    },
    
    notes: { type: String },
    pdfUrl: { type: String },
  },
  { timestamps: true }
);

// Auto-calculate balanceDue and determine status
receiptSchema.pre('save', async function () {
  if (this.isModified('amount') || this.isModified('advancePaid')) {
    this.balanceDue = this.amount - this.advancePaid;
    if (this.balanceDue <= 0) {
      this.status = 'PAID';
    } else if (this.advancePaid > 0) {
      this.status = 'PARTIAL';
    } else {
      this.status = 'PENDING';
    }
  }
});

// Auto-generate receiptNo before validation if not provided (RCP-<CITY_PREFIX>-<YYYY>-<NUM>)
receiptSchema.pre('validate', async function () {
  if (this.isNew && !this.receiptNo && this.branchId) {
    try {
      const branch = await Branch.findById(this.branchId);
      if (branch && branch.cityPrefix) {
        const year = new Date().getFullYear();
        this.receiptNo = await generateAutoId(
          this.constructor,
          `RCP-${branch.cityPrefix}-${year}`,
          'receiptNo',
          4 // e.g., RCP-LKO-2026-0001
        );
      }
    } catch (error) {
      throw error;
    }
  }
});

module.exports = mongoose.model('Receipt', receiptSchema);
