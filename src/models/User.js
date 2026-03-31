const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { generateAutoId } = require('../utils/autoId');
const Branch = require('./Branch');

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ['super_admin', 'branch_admin', 'technician', 'sales', 'office'],
      default: 'office',
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    designation: {
      type: String,
      trim: true,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    profileImage: {
      type: String,
      default: null,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1 });
userSchema.index({ branchId: 1 });
userSchema.index({ phone: 1 });

// Auto-generate employeeId before validation if not provided (EMP-<CITY_PREFIX>-<NUM>)
userSchema.pre('validate', async function () {
  // Only for actual branch employees, super_admin might not need this or can have a custom one
  if (this.isNew && !this.employeeId && this.branchId && this.role !== 'super_admin') {
    try {
      const branch = await Branch.findById(this.branchId);
      if (branch && branch.cityPrefix) {
        this.employeeId = await generateAutoId(
          this.constructor,
          `EMP-${branch.cityPrefix}`,
          'employeeId',
          3 // e.g., EMP-LKO-001
        );
      }
    } catch (error) {
      throw error;
    }
  }
});

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

// Compare plain password with hashed
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Don't return sensitive fields in JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
