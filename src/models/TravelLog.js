const mongoose = require('mongoose');

const travelLogSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  purpose: {
    type: String,
    enum: ['SERVICE', 'PICKUP', 'SUPPLIER', 'EMERGENCY', 'OFFICE', 'OTHER'],
    required: true
  },
  purposeNotes: {
    type: String,
    default: ''
  },
  formId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceForm',
    default: null
  },
  fromLocation: {
    type: String,
    default: ''
  },
  toLocation: {
    type: String,
    default: ''
  },
  startMeter: {
    type: Number,
    default: 0
  },
  startMeterPhoto: {
    type: String,
    default: null
  },
  startTime: {
    type: Date,
    default: null
  },
  endMeter: {
    type: Number,
    default: 0
  },
  endMeterPhoto: {
    type: String,
    default: null
  },
  endTime: {
    type: Date,
    default: null
  },
  distance: {
    type: Number,
    default: 0
  },
  vehicleNo: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['DRAFT', 'COMPLETED'],
    default: 'DRAFT'
  },
  ratePerKm: {
    type: Number,
    default: 10
  },
  allowance: {
    type: Number,
    default: 0
  },
  branchAdminStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  branchAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  branchAdminRemark: {
    type: String,
    default: ''
  },
  superAdminStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  superAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  superAdminRemark: {
    type: String,
    default: ''
  },
  employeeStatus: {
    type: String,
    enum: ['PENDING', 'ACCEPTED'],
    default: 'PENDING'
  },
  settledAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

travelLogSchema.index({ employeeId: 1, date: -1 });
travelLogSchema.index({ branchAdminStatus: 1 });
travelLogSchema.index({ superAdminStatus: 1 });

module.exports = mongoose.model('TravelLog', travelLogSchema);
