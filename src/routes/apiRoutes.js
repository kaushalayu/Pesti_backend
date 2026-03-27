const express = require('express');
const authRoutes = require('./authRoutes');
const branchRoutes = require('./branchRoutes');
const employeeRoutes = require('./employeeRoutes');
const formRoutes = require('./formRoutes');
const receiptRoutes = require('./receiptRoutes');
const enquiryRoutes = require('./enquiryRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const collectionRoutes = require('./collectionRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const expenseRoutes = require('./expenseRoutes');
const uploadRoutes = require('./uploadRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/branches', branchRoutes);
router.use('/employees', employeeRoutes);
router.use('/forms', formRoutes);
router.use('/receipts', receiptRoutes);
router.use('/enquiries', enquiryRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/collections', collectionRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/expenses', expenseRoutes);
router.use('/upload', uploadRoutes);

module.exports = router;
