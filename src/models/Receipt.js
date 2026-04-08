const mongoose = require('mongoose');

const floorDetailSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  length: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
  area: { type: Number, default: 0 }
}, { _id: false });

const receiptSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, unique: true },
    formId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceForm' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    amcId: { type: mongoose.Schema.Types.ObjectId, ref: 'AMC' },
    
    customerName: { type: String, required: true },
    customerEmail: { type: String },
    customerPhone: { type: String, required: true },
    customerAddress: { type: String },
    customerGstNo: { type: String },
    
    serviceType: { type: String, enum: ['AMC', 'GPC', 'ATT', 'BOTH'], default: 'AMC' },
    category: { type: String, enum: ['Residential', 'Commercial', 'Industrial'], default: 'Residential' },
    premisesType: { type: String, default: 'Bunglow' },
    
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    serviceDescription: { type: String },
    
    floors: [floorDetailSchema],
    totalArea: { type: Number, default: 0 },
    
    amcRatePerSqft: { type: Number, default: 0 },
    amcAmount: { type: Number, default: 0 },
    
    attDetails: {
      treatmentTypes: [{ type: String }],
      chemicals: [{ type: String }],
      methods: [{ type: String }],
      baseSolutions: [{ type: String }],
      constructionPhase: { type: String },
      warranty: { type: String },
      ratePerSqft: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    },
    attAmount: { type: Number, default: 0 },
    
    serviceTotal: { type: Number, default: 0 },
    baseAmount: { type: Number, required: true },
    
    gstPercent: { type: Number, default: 18 },
    gstAmount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    
    advancePaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    
    paymentMode: { 
      type: String, 
      enum: ['CASH', 'CHEQUE', 'NEFT', 'ONLINE', 'UPI', 'WALLET', 'PENDING', 'Cash', 'cash'],
      required: true 
    },
    paymentDate: { type: Date, default: Date.now },
    transactionId: { type: String },
    paymentScreenshot: { type: String },
    
    approvalStatus: { 
      type: String, 
      enum: ['PENDING', 'BRANCH_APPROVED', 'APPROVED', 'REJECTED'], 
      default: 'PENDING' 
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    
    branchApprovalStatus: { 
      type: String, 
      enum: ['PENDING', 'APPROVED', 'REJECTED'], 
      default: 'PENDING' 
    },
    branchApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    branchApprovedAt: { type: Date },
    branchRejectionReason: { type: String },
    
    status: { 
      type: String, 
      enum: ['PENDING', 'PARTIAL', 'PAID'], 
      default: 'PENDING' 
    },
    
    notes: { type: String },
    pdfUrl: { type: String },
    emailSentAt: { type: Date },
  },
  { timestamps: true }
);

receiptSchema.index({ branchId: 1, createdAt: -1 });
receiptSchema.index({ employeeId: 1, createdAt: -1 });
receiptSchema.index({ approvalStatus: 1 });
receiptSchema.index({ status: 1 });
receiptSchema.index({ customerPhone: 1 });
receiptSchema.index({ createdAt: -1 });

receiptSchema.pre('save', async function () {
  if (this.isModified('totalAmount') || this.isModified('advancePaid')) {
    this.balanceDue = Math.ceil(this.totalAmount - this.advancePaid);
    if (this.balanceDue <= 0) {
      this.status = 'PAID';
    } else if (this.advancePaid > 0) {
      this.status = 'PARTIAL';
    } else {
      this.status = 'PENDING';
    }
  }
});

module.exports = mongoose.model('Receipt', receiptSchema);
