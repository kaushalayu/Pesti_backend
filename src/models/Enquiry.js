const mongoose = require('mongoose');
const { generateUniqueId } = require('../utils/generateId');
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
    propertySize: { type: String },
    
    source: { 
      type: String, 
      enum: ['Field', 'Reference', 'Walk-in', 'Online'],
      required: true
    },
    
    status: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'VISIT_DONE', 'DEMO_SCHEDULED', 'QUALIFIED', 'CONVERTED', 'LOST'],
      default: 'NEW'
    },
    
    priority: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW'],
      default: 'MEDIUM'
    },
    
    followUpDate: { type: Date },
    nextFollowUp: { type: Date },
    notes: { type: String },
    
    followUps: [{
      date: { type: Date, default: Date.now },
      notes: { type: String },
      nextFollowUp: { type: Date },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

enquirySchema.index({ branchId: 1, createdAt: -1 });
enquirySchema.index({ addedBy: 1, createdAt: -1 });
enquirySchema.index({ status: 1 });
enquirySchema.index({ mobile: 1 });
enquirySchema.index({ customerName: 'text' });
enquirySchema.index({ createdAt: -1 });

enquirySchema.pre('validate', async function () {
  if (this.isNew && !this.enquiryId && this.branchId && this.addedBy) {
    try {
      const branch = await Branch.findById(this.branchId).select('branchCode');
      const User = mongoose.model('User');
      const user = await User.findById(this.addedBy).select('employeeId');
      
      const branchCode = branch?.branchCode?.replace(/-/g, '').substring(0, 3) || 'HQ';
      const empCode = user?.employeeId?.replace(/-/g, '').substring(0, 3) || 'S00';
      
      this.enquiryId = generateUniqueId('ENQ', branchCode, empCode);
    } catch (error) {
      throw error;
    }
  }
});

module.exports = mongoose.model('Enquiry', enquirySchema);
