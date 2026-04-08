const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  address: { type: String },
  city: { type: String, required: true },
  
  source: { 
    type: String, 
    enum: ['Walk-in', 'Phone Call', 'Website', 'Google', 'Facebook', 'Justdial', 'Reference', 'Social Media', 'Other'],
    default: 'Walk-in'
  },
  sourceDetail: { type: String },
  
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedAt: { type: Date },
  
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  status: { 
    type: String, 
    enum: ['NEW', 'CONTACTED', 'VISIT_DONE', 'DEMO_SCHEDULED', 'QUALIFIED', 'CONVERTED', 'LOST', 'JUNK'],
    default: 'NEW'
  },
  
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
  
  propertyType: { type: String, enum: ['Residential', 'Commercial', 'Industrial', 'Office', 'Restaurant', 'Hotel', 'Hospital', 'Warehouse', 'Other'] },
  totalArea: { type: Number },
  areaUnit: { type: String, enum: ['sqft', 'sqmt', 'sqyd', 'acre'], default: 'sqft' },
  
  serviceInterest: [{ type: String, enum: ['AMC', 'GPC', 'ATT', 'BOTH', 'Fumigation', 'Rodent', 'Bird Control', 'Other'] }],
  budget: { type: Number },
  budgetRange: { type: String, enum: ['Under 5K', '5K-10K', '10K-25K', '25K-50K', '50K-1L', 'Above 1L'] },
  
  requirement: { type: String },
  notes: { type: String },
  
  nextFollowUp: { type: Date },
  lastContactedAt: { type: Date },
  convertedAt: { type: Date },
  
  convertedToForm: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceForm' },
  conversionDate: { type: Date },
  
  followups: [{
    date: { type: Date, default: Date.now },
    notes: { type: String },
    outcome: { type: String, enum: ['CALL_NOT_ANSWERED', 'BUSY', 'NOT_INTERESTED', 'PRICE_HIGH', 'COMPETING', 'SCHEDULED_VISIT', 'OTHER'] },
    nextFollowUp: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  expectedCloseDate: { type: Date },
  leadScore: { type: Number, default: 0 },
  
  campaign: { type: String },
  competition: { type: String },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
}, { timestamps: true });

leadSchema.index({ status: 1, branchId: 1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ nextFollowUp: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ name: 'text', phone: 'text', email: 'text' });

module.exports = mongoose.model('Lead', leadSchema);