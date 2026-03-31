const mongoose = require('mongoose');
const { generateAutoId } = require('../utils/autoId');

const branchSchema = new mongoose.Schema(
  {
    branchCode: {
      type: String,
      unique: true,
      trim: true,
    },
    branchName: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City name is required'],
      trim: true,
      uppercase: true,
    },
    cityPrefix: {
      type: String,
      required: [true, 'City prefix (e.g., LKO) is required'],
      uppercase: true,
      minlength: 2,
      maxlength: 4,
    },
    address: {
      type: String,
      required: [true, 'Branch address is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Branch phone number is required'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    
    totalReceivedValue: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

branchSchema.pre('validate', async function () {
  if (this.isNew && !this.branchCode && this.cityPrefix) {
    try {
      this.branchCode = await generateAutoId(
        this.constructor,
        this.cityPrefix,
        'branchCode',
        3
      );
    } catch (error) {
      throw error;
    }
  }
});

module.exports = mongoose.model('Branch', branchSchema);
