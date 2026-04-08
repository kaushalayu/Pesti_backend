const mongoose = require('mongoose');
const { generateUniqueId } = require('../utils/generateId');

const notificationSchema = new mongoose.Schema(
  {
    notificationId: { type: String, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'EXPENSE_APPROVED',
        'EXPENSE_REJECTED',
        'RECEIPT_APPROVED',
        'RECEIPT_REJECTED',
        'FORM_SCHEDULED',
        'FORM_COMPLETED',
        'FORM_CREATED',
        'NEW_BOOKING',
        'AMC_EXPIRING',
        'NEW_ASSIGNMENT',
        'TASK_ASSIGNED',
        'TASK_ACCEPTED',
        'TASK_DECLINED',
        'TASK_COMPLETED',
        'RECEIPT_PENDING',
        'GENERAL'
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    relatedType: {
      type: String,
      enum: ['Expense', 'Receipt', 'ServiceForm', 'AMC', 'User', 'General', 'FORM', 'TASK', 'Booking'],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

notificationSchema.pre('save', async function() {
  if (this.isNew && !this.notificationId) {
    this.notificationId = generateUniqueId('NTF', '', '');
  }
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
