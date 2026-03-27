const mongoose = require('mongoose');
const { generateAutoId } = require('../utils/autoId');
const Branch = require('./Branch');

const serviceFormSchema = new mongoose.Schema(
  {
    orderNo: { type: String, unique: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    
    // Snapshot of customer data to preserve history even if customer updates
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

    serviceCategory: {
      type: String,
      enum: ['Residential', 'Commercial', 'Industrial'],
      required: true,
    },

    attDetails: {
      constructionPhase: { type: String },
      treatmentType: { type: String },
      chemical: { type: String },
      method: { type: String },
      base: { type: String },
    },

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
      floors: { type: Number },
      otherArea: { type: String },
      measurement: { type: Number }, // sqft
      rooms: { type: Number },
    },

    schedule: {
      type: { type: String, enum: ['Single', 'One Time', 'Monthly', 'Yearly'], required: true },
      date: { type: String },
      time: { type: String },
    },

    billing: {
      paymentMode: { type: String, enum: ['Cash', 'Cheque', 'NEFT', 'Online', 'Pending'] },
      advance: { type: Number, default: 0 },
      due: { type: Number, default: 0 },
      total: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      paymentDetail: { type: String },
    },

    contract: {
      contractNo: { type: String },
      period: { type: String },
      warranty: { type: String },
    },

    signatures: {
      employeeSignature: { type: String }, // Can be base64 data URI of canvas
      customerSignature: { type: String }, // Can be base64 data URI of canvas
    },

    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
    },

    logistics: {
      vehicleNo: { type: String },
      startMeter: { type: Number },
      endMeter: { type: Number },
      startMeterPhoto: { type: String },
      endMeterPhoto: { type: String },
    },

    pdfUrl: { type: String },
    emailSentAt: { type: Date },
  },
  { timestamps: true }
);

// Auto-generate orderNo before validation if not provided (ORD-<CITY_PREFIX>-<YYYY>-<NUM>)
serviceFormSchema.pre('validate', async function () {
  if (this.isNew && !this.orderNo && this.branchId) {
    try {
      const Branch = mongoose.model('Branch');
      const branch = await Branch.findById(this.branchId);
      if (branch && branch.cityPrefix) {
        const year = new Date().getFullYear();
        this.orderNo = await generateAutoId(
          mongoose.model('ServiceForm'),
          `ORD-${branch.cityPrefix}-${year}`,
          'orderNo',
          4 // e.g., ORD-LKO-2026-0001
        );
      }
    } catch (error) {
      console.error('Error generating order number:', error.message);
      // Don't throw, let validation either pass or fail based on schema requirements
    }
  }
});

module.exports = mongoose.model('ServiceForm', serviceFormSchema);
