const mongoose = require('mongoose');
const { generateUniqueId } = require('../utils/generateId');

const floorSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  length: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
  area: { type: Number, default: 0 }
}, { _id: true });

const attDetailsSchema = new mongoose.Schema({
  treatmentTypes: [{ type: String }],
  chemicals: [{ type: String }],
  methods: [{ type: String }],
  baseSolutions: [{ type: String }],
  constructionPhase: { type: String },
  warranty: { type: String }
}, { _id: false });

const serviceFormSchema = new mongoose.Schema(
  {
    orderNo: { type: String, unique: true },
    contractNo: { type: String },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    
    customer: {
      title: { type: String },
      name: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      gstNo: { type: String },
      phone: { type: String, required: true },
      whatsapp: { type: String },
      email: { type: String },
    },

    reference: {
      type: String,
      enum: ['Company', 'Social Media', 'Website', 'Walk-in', 'Referral', 'Google', 'Facebook', 'Justdial', 'Other'],
      default: 'Walk-in'
    },
    referenceBy: { type: String },

    serviceCategory: {
      type: String,
      enum: ['Residential', 'Commercial', 'Industrial'],
      required: true,
    },

    serviceType: {
      type: String,
      enum: ['AMC', 'GPC', 'ATT', 'BOTH'],
      required: true,
    },

    attDetails: attDetailsSchema,

    amcServices: [
      {
        type: String,
        enum: [
          'Cockroaches', 'Ants', 'Spider', 'Mosquito', 'Flies', 'Lizard',
          'Rodent', 'Vector', 'Bed Bugs', 'Wood Borer', 'Fumigation', 'Others'
        ]
      }
    ],

    premises: {
      type: { type: String },
      floors: [floorSchema],
      totalArea: { type: Number, default: 0 },
    },

    ratePerSqft: { type: Number, default: 0 },
    perFloorExtra: { type: Number, default: 0 },

    pricing: {
      baseAmount: { type: Number, default: 0 },
      gstPercent: { type: Number, default: 18 },
      gstAmount: { type: Number, default: 0 },
      discountPercent: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 },
      finalAmount: { type: Number, default: 0 }
    },

    schedule: {
      type: { type: String, enum: ['Single', 'One Time', 'Monthly', 'Yearly'], required: true },
      date: { type: String },
      time: { type: String },
      period: { type: Number },
      servicesPerMonth: { type: Number },
      serviceCount: { type: Number },
      intervalDays: { type: Number },
      scheduledDates: [{ 
        date: { type: String },
        formatted: { type: String },
        dayNumber: { type: Number }
      }]
    },

    billing: {
      paymentMode: { type: String, enum: ['Cash', 'Cheque', 'NEFT', 'Online', 'Wallet', 'Pending'] },
      total: { type: Number, default: 0 },
      advance: { type: Number, default: 0 },
      due: { type: Number, default: 0 },
      paymentDetail: { type: String },
      transactionNo: { type: String },
      paymentImage: { type: String },
      lastPaymentDate: { type: Date },
    },

    contract: {
      agreementArea: { type: Number },
      ratePerSqft: { type: Number },
      period: { type: String },
      warranty: { type: String },
      startDate: { type: String },
      endDate: { type: String },
    },

    executive: {
      name: { type: String },
      phone: { type: String }
    },

    signatures: {
      employeeSignature: { type: String },
      customerSignature: { type: String },
    },

    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
    },

    statusHistory: [{
      status: { type: String },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      changedAt: { type: Date, default: Date.now },
      notes: { type: String }
    }],

    logistics: {
      vehicleNo: { type: String },
      startMeter: { type: Number },
      endMeter: { type: Number },
      startMeterPhoto: { type: String },
      endMeterPhoto: { type: String },
    },

    serviceDetails: {
      startTime: { type: String },
      endTime: { type: String },
      duration: { type: String },
      serviceDate: { type: String },
      remarks: { type: String }
    },

    pesticides: [{
      name: { type: String },
      quantity: { type: Number },
      unit: { type: String, default: 'L' },
      rate: { type: Number }
    }],

    pdfUrl: { type: String },
    emailSentAt: { type: Date },
  },
  { timestamps: true }
);

serviceFormSchema.index({ branchId: 1, createdAt: -1 });
serviceFormSchema.index({ employeeId: 1, createdAt: -1 });
serviceFormSchema.index({ status: 1 });
serviceFormSchema.index({ 'customer.phone': 1 });
serviceFormSchema.index({ 'customer.name': 'text' });
serviceFormSchema.index({ createdAt: -1 });
serviceFormSchema.index({ 'logistics.startMeter': 1, 'logistics.endMeter': 1 });

serviceFormSchema.pre('validate', async function () {
  if (this.isNew && !this.orderNo && this.branchId && this.employeeId) {
    try {
      const Branch = mongoose.model('Branch');
      const User = mongoose.model('User');
      
      const branch = await Branch.findById(this.branchId).select('branchCode');
      const user = await User.findById(this.employeeId).select('employeeId');
      
      const branchCode = branch?.branchCode?.replace(/-/g, '').substring(0, 3) || 'HQ';
      const empCode = user?.employeeId?.replace(/-/g, '').substring(0, 3) || 'S00';
      
      this.orderNo = generateUniqueId('ORD', branchCode, empCode);
    } catch (error) {
      console.error('Error generating order number:', error.message);
    }
  }
  
  if (this.isNew && !this.contractNo && this.branchId) {
    try {
      const Branch = mongoose.model('Branch');
      const ServiceForm = mongoose.model('ServiceForm');
      
      const branch = await Branch.findById(this.branchId).select('branchCode');
      const branchCode = branch?.branchCode?.replace(/-/g, '').substring(0, 3) || 'HQ';
      const year = new Date().getFullYear();
      
      const count = await ServiceForm.countDocuments({
        branchId: this.branchId,
        contractNo: { $regex: `CNT-${branchCode}-${year}-` }
      });
      
      this.contractNo = `CNT-${branchCode}-${year}-${String(count + 1).padStart(4, '0')}`;
    } catch (error) {
      console.error('Error generating contract number:', error.message);
    }
  }
  
  if (this.premises?.floors && this.premises.floors.length > 0) {
    this.premises.totalArea = this.premises.floors.reduce((sum, floor) => sum + (floor.area || 0), 0);
  }
  
  if (this.ratePerSqft && this.premises?.totalArea) {
    const areaAmount = Math.ceil(this.premises.totalArea * this.ratePerSqft);
    const floorExtra = Math.ceil((this.premises.floors?.length || 0) * (this.perFloorExtra || 0));
    const baseAmount = areaAmount + floorExtra;
    const gstAmount = Math.ceil(baseAmount * (this.pricing?.gstPercent || 18) / 100);
    const discountAmount = Math.ceil(baseAmount * (this.pricing?.discountPercent || 0) / 100);
    const finalAmount = baseAmount + gstAmount - discountAmount;
    
    this.pricing = {
      ...this.pricing,
      baseAmount,
      gstAmount,
      discountAmount,
      finalAmount
    };
  }
});

module.exports = mongoose.model('ServiceForm', serviceFormSchema);
