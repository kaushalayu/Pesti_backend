const mongoose = require('mongoose');

const taskAssignmentSchema = new mongoose.Schema({
  serviceFormId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceForm',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ASSIGNED', 'ACCEPTED', 'DECLINED', 'COMPLETED'],
    default: 'PENDING'
  },
  notes: String,
  declineReason: String,
  assignedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: Date,
  declinedAt: Date,
  completedAt: Date
});

taskAssignmentSchema.index({ assignedTo: 1, scheduledDate: 1 });
taskAssignmentSchema.index({ branchId: 1, scheduledDate: 1 });
taskAssignmentSchema.index({ status: 1 });

module.exports = mongoose.model('TaskAssignment', taskAssignmentSchema);
