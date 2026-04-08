const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['super_admin', 'branch_admin', 'technician', 'sales', 'office'], default: 'super_admin' },
  isActive: { type: Boolean, default: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
}, { timestamps: true });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    await createSuperAdmin();
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

async function createSuperAdmin() {
  if (!process.env.SUPER_ADMIN_EMAIL || !process.env.SUPER_ADMIN_PASSWORD) {
    console.log('⚠️  SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set in .env');
    return;
  }

  try {
    const User = mongoose.models.User || mongoose.model('User', userSchema);

    const existingUser = await User.findOne({ email: process.env.SUPER_ADMIN_EMAIL });

    if (existingUser) {
      console.log('ℹ️  Super Admin already exists in database');
      return;
    }

    const passwordHash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, 12);

    await User.create({
      name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
      email: process.env.SUPER_ADMIN_EMAIL,
      passwordHash,
      role: 'super_admin',
      isActive: true,
    });

    console.log('✅ Super Admin created from .env credentials');
  } catch (error) {
    console.error('❌ Error creating Super Admin:', error.message);
  }
}

module.exports = connectDB;
