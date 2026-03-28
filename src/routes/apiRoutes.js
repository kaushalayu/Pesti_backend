const express = require('express');
const authRoutes = require('./authRoutes');
const branchRoutes = require('./branchRoutes');
const customerRoutes = require('./customerRoutes');
const employeeRoutes = require('./employeeRoutes');
const formRoutes = require('./formRoutes');
const receiptRoutes = require('./receiptRoutes');
const enquiryRoutes = require('./enquiryRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const collectionRoutes = require('./collectionRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const expenseRoutes = require('./expenseRoutes');
const amcRoutes = require('./amcRoutes');
const uploadRoutes = require('./uploadRoutes');
const serviceRateRoutes = require('./serviceRateRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/branches', branchRoutes);
router.use('/customers', customerRoutes);
router.use('/employees', employeeRoutes);
router.use('/forms', formRoutes);
router.use('/receipts', receiptRoutes);
router.use('/enquiries', enquiryRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/collections', collectionRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/expenses', expenseRoutes);
router.use('/amc', amcRoutes);
router.use('/upload', uploadRoutes);
router.use('/service-rates', serviceRateRoutes);

module.exports = router;
