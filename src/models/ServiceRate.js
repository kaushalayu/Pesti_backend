const mongoose = require('mongoose');

const serviceRateSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true,
    enum: ['Cockroaches', 'Ants', 'Spider', 'Mosquito', 'Flies', 'Lizard', 'Rodent', 'Vector', 'Bed Bugs', 'Wood Borer', 'Fumigation', 'Others']
  },
  category: {
    type: String,
    required: true,
    enum: ['Residential', 'Commercial', 'Industrial']
  },
  premisesType: {
    type: String,
    default: 'General'
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    default: null
  }
}, { timestamps: true });

serviceRateSchema.index({ serviceName: 1, category: 1, branchId: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
serviceRateSchema.index({ category: 1, isActive: 1 });
serviceRateSchema.index({ branchId: 1, isActive: 1 });

module.exports = mongoose.model('ServiceRate', serviceRateSchema);
