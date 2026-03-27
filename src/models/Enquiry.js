const mongoose = require('mongoose');
const { generateAutoId } = require('../utils/autoId');
const Branch = require('./Branch');

const enquirySchema = new mongoose.Schema(
  {
    enquiryId: { type: String, unique: true },
    customerName: { type: String, required: true },
    mobile: { type: String, required: true },
    alternatePhone: { type: String },
    email: { type: String },
    address: { type: String },
    city: { type: String, required: true },
    
    requirement: { type: String, required: true },
    serviceType: { 
      type: String, 
      enum: ['Residential', 'Commercial', 'Industrial'],
      required: true
    },
    pestType: [
      {
        type: String,
        enum: [
          'Cockroaches', 'Ants', 'Spider', 'Mosquito', 'Flies', 'Lizard',
          'Rodent', 'Vector', 'Bed Bugs', 'Wood Borer', 'Fumigation', 'Others'
        ]
      }
    ],
    propertySize: { type: String }, // e.g., 2BHK, 1500 sqft
    
    source: { 
      type: String, 
      enum: ['Field', 'Reference', 'Walk-in', 'Online'],
      required: true
    },
    
    status: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'CONVERTED', 'LOST'],
      default: 'NEW'
    },
    
    priority: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW'],
      default: 'MEDIUM'
    },
    
    followUpDate: { type: Date },
    notes: { type: String },
    
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Auto-generate enquiryId before validation
enquirySchema.pre('validate', async function () {
  if (this.isNew && !this.enquiryId && this.branchId) {
    try {
      const branch = await Branch.findById(this.branchId);
      if (branch && branch.cityPrefix) {
        const year = new Date().getFullYear();
        this.enquiryId = await generateAutoId(
          this.constructor,
          `ENQ-${branch.cityPrefix}-${year}`,
          'enquiryId',
          4 // e.g., ENQ-LKO-2026-0001
        );
      }
    } catch (error) {
      throw error;
    }
  }
});

module.exports = mongoose.model('Enquiry', enquirySchema);
