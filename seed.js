const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./src/models/User');
const Branch = require('./src/models/Branch');
const ServiceForm = require('./src/models/ServiceForm');
const TaskAssignment = require('./src/models/TaskAssignment');
const Receipt = require('./src/models/Receipt');
const Chemical = require('./src/models/Chemical');
const Inventory = require('./src/models/Inventory');
const Customer = require('./src/models/Customer');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pest_control';

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear ALL test data
    await User.deleteMany({ email: { $in: ['hq@safehome.com', 'branch@test.com', 'tech1@test.com', 'tech2@test.com', 'rajesh@test.com', 'amit@test.com'] } });
    await Branch.deleteMany({ branchCode: 'DEL-S' });
    await ServiceForm.deleteMany({ 'customer.phone': { $in: ['9876543210', '9876543211'] } });
    await TaskAssignment.deleteMany({});
    await Receipt.deleteMany({});
    await Chemical.deleteMany({ name: { $in: ['Bayer Imidacloprid', 'Termidor Chemical', 'Chlorpyrifos', 'Gel Bait', 'Cypermethrin'] } });
    await Inventory.deleteMany({});
    await Customer.deleteMany({ phone: { $in: ['9876543210', '9876543211'] } });
    console.log('Cleared existing test data');

    // Create Test Branch
    const branch = await Branch.create({
      branchName: 'Delhi South',
      branchCode: 'DEL-S',
      cityPrefix: 'DEL',
      city: 'Delhi',
      address: 'South Delhi, Delhi 110001',
      phone: '011-45678900',
      email: 'delsouth@safehome.com',
      isActive: true
    });
    console.log('Created Branch:', branch.branchName);

    // Create HQ (Super Admin)
    const hqUser = await User.create({
      name: 'HQ Admin',
      email: 'hq@safehome.com',
      passwordHash: 'admin123',
      role: 'super_admin',
      employeeId: 'HQ001',
      isActive: true
    });
    console.log('Created HQ Admin:', hqUser.email);

    // Create Branch Admin
    const branchAdmin = await User.create({
      name: 'Branch Manager',
      email: 'branch@test.com',
      passwordHash: 'admin123',
      role: 'branch_admin',
      employeeId: 'BR001',
      branchId: branch._id,
      isActive: true
    });
    console.log('Created Branch Admin:', branchAdmin.email);

    // Create Technician
    const technician = await User.create({
      name: 'Ramesh Technician',
      email: 'tech1@test.com',
      passwordHash: 'admin123',
      role: 'technician',
      employeeId: 'TECH001',
      branchId: branch._id,
      isActive: true
    });
    console.log('Created Technician:', technician.email);

    // Create Second Technician
    const technician2 = await User.create({
      name: 'Suresh Technician',
      email: 'tech2@test.com',
      passwordHash: 'admin123',
      role: 'technician',
      employeeId: 'TECH002',
      branchId: branch._id,
      isActive: true
    });
    console.log('Created Technician:', technician2.email);

    // Create Test Customer
    const customer = await Customer.create({
      name: 'Rajesh Kumar',
      phone: '9876543210',
      email: 'rajesh@test.com',
      address: '42, South Extension, Delhi 110049',
      city: 'Delhi',
      branchId: branch._id
    });
    console.log('Created Customer:', customer.name);

    // Create Chemicals
    const chemicals = await Chemical.insertMany([
      {
        name: 'Bayer Imidacloprid',
        category: 'Insecticide',
        unit: 'Liters',
        unitSystem: 'L',
        purchasePrice: 450,
        branchPrice: 500,
        mainStock: 50,
        minStock: 10,
        isActive: true
      },
      {
        name: 'Termidor Chemical',
        category: 'Insecticide',
        unit: 'Liters',
        unitSystem: 'L',
        purchasePrice: 850,
        branchPrice: 950,
        mainStock: 30,
        minStock: 5,
        isActive: true
      },
      {
        name: 'Chlorpyrifos',
        category: 'Insecticide',
        unit: 'Liters',
        unitSystem: 'L',
        purchasePrice: 380,
        branchPrice: 420,
        mainStock: 40,
        minStock: 8,
        isActive: true
      },
      {
        name: 'Gel Bait',
        category: 'Others',
        unit: 'Grams',
        unitSystem: 'G',
        purchasePrice: 120,
        branchPrice: 150,
        mainStock: 100,
        minStock: 20,
        isActive: true
      },
      {
        name: 'Cypermethrin',
        category: 'Insecticide',
        unit: 'Liters',
        unitSystem: 'L',
        purchasePrice: 320,
        branchPrice: 360,
        mainStock: 60,
        minStock: 15,
        isActive: true
      }
    ]);
    console.log('Created Chemicals:', chemicals.length);

    // Create AMC Service Form (Submitted status)
    const serviceForm = await ServiceForm.create({
      orderNo: `ORD-${branch.branchCode}-${branch.employeeId || 'S00'}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).substr(2,4).toUpperCase()}`,
      customer: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        city: 'Delhi'
      },
      customerId: customer._id,
      branchId: branch._id,
      employeeId: technician._id,
      serviceType: 'AMC',
      serviceCategory: 'Residential',
      status: 'SUBMITTED',
      category: 'Residential',
      premisesType: 'Bunglow',
      schedule: {
        type: 'One Time',
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        time: 'Morning (9AM - 12PM)'
      },
      premises: {
        floors: [{ label: 'Ground Floor', length: 40, width: 30, area: 1200 }],
        totalArea: 1200,
        extraSqft: 0
      },
      pricing: {
        baseAmount: 12000,
        gstPercent: 18,
        gstAmount: 2160,
        discountAmount: 0,
        finalAmount: 14160,
        advancePaid: 5000
      },
      billing: {
        total: 14160,
        advance: 5000,
        balanceDue: 9160
      },
      amcServices: ['Cockroaches', 'Ants', 'Mosquito'],
      notes: 'Test AMC booking for workflow',
      termsAccepted: true
    });
    console.log('Created Service Form:', serviceForm.orderNo);

    // Create TaskAssignment for this form
    await TaskAssignment.create({
      serviceFormId: serviceForm._id,
      assignedTo: null, // Unassigned - ready for assignment
      assignedBy: branchAdmin._id,
      branchId: branch._id,
      scheduledDate: serviceForm.schedule.date,
      notes: 'Auto-created task for AMC booking',
      status: 'PENDING'
    });
    console.log('Created TaskAssignment (Unassigned)');

    // Create Another Service Form (Draft status)
    const serviceForm2 = await ServiceForm.create({
      orderNo: `ORD-${branch.branchCode}-${branch.employeeId || 'S00'}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).substr(2,4).toUpperCase()}`,
      customer: {
        name: 'Amit Singh',
        phone: '9876543211',
        email: 'amit@test.com',
        address: '15, Greater Kailash, Delhi 110048',
        city: 'Delhi'
      },
      customerId: customer._id,
      branchId: branch._id,
      employeeId: technician._id,
      serviceType: 'ATT',
      serviceCategory: 'Commercial',
      status: 'DRAFT',
      category: 'Commercial',
      premisesType: 'Office',
      schedule: {
        type: 'Single',
        date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        time: 'Afternoon (1PM - 4PM)'
      },
      premises: {
        floors: [
          { label: 'Ground Floor', length: 60, width: 40, area: 2400 },
          { label: 'First Floor', length: 60, width: 40, area: 2400 }
        ],
        totalArea: 4800,
        extraSqft: 0
      },
      pricing: {
        baseAmount: 48000,
        gstPercent: 18,
        gstAmount: 8640,
        discountAmount: 2000,
        finalAmount: 54640,
        advancePaid: 10000
      },
      billing: {
        total: 54640,
        advance: 10000,
        balanceDue: 44640
      },
      termsAccepted: true
    });
    console.log('Created Service Form 2:', serviceForm2.orderNo);

    // Create Branch Inventory with some stock
    for (const chem of chemicals.slice(0, 3)) {
      await Inventory.create({
        chemicalId: chem._id,
        ownerId: branch._id,
        ownerType: 'Branch',
        quantity: Math.floor(Math.random() * 10) + 5,
        unit: chem.unitSystem,
        transferRate: chem.branchPrice,
        unitPrice: chem.branchPrice,
        totalValue: Math.floor(Math.random() * 10 + 5) * chem.branchPrice,
        originalQuantity: Math.floor(Math.random() * 10) + 5,
        purchaseRate: chem.purchasePrice,
        purchasePrice: chem.purchasePrice,
        isActive: true
      });
    }
    console.log('Created Branch Inventory');

    console.log('\n========================================');
    console.log('SEED DATA CREATED SUCCESSFULLY!');
    console.log('========================================\n');
    console.log('LOGIN CREDENTIALS:\n');
    console.log('HQ Admin (Super Admin):');
    console.log('  Email: hq@safehome.com');
    console.log('  Password: admin123\n');
    console.log('Branch Admin:');
    console.log('  Email: branch@test.com');
    console.log('  Password: admin123\n');
    console.log('Technician 1:');
    console.log('  Email: tech1@test.com');
    console.log('  Password: admin123\n');
    console.log('Technician 2:');
    console.log('  Email: tech2@test.com');
    console.log('  Password: admin123\n');
    console.log('========================================\n');
    console.log('WORKFLOW TO TEST:\n');
    console.log('1. Login as Branch Admin (branch@test.com)');
    console.log('2. Go to Task Assignment - See unassigned booking');
    console.log('3. Assign task to Technician');
    console.log('4. Go to Inventory - Check chemicals');
    console.log('5. As HQ Admin - Buy new chemicals');
    console.log('6. Transfer chemicals to branch');
    console.log('7. Branch Admin - Accept transfer');
    console.log('8. Distribute to technician');
    console.log('========================================\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Seed Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
