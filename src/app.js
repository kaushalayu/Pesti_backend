require("dotenv").config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, './uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const AppError = require('./utils/AppError');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
};

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Cache control for static uploads
app.use('/uploads', express.static(path.join(__dirname, './uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
}));

// Cache headers for API responses
app.use('/api', (req, res, next) => {
  // Skip cache for non-GET requests
  if (req.method !== 'GET') {
    return next();
  }
  
  // List of endpoints that should have longer cache
  const longCachePatterns = [
    '/api/branches',
    '/api/service-rates',
  ];
  
  // Check if the path matches long cache patterns
  const shouldLongCache = longCachePatterns.some(pattern => req.path.startsWith(pattern));
  
  if (shouldLongCache) {
    // 1 hour cache for reference data
    res.set('Cache-Control', 'private, max-age=3600');
  } else if (req.path.includes('/dashboard') || req.path.includes('/stats')) {
    // Short cache for dashboard/stats (5 minutes)
    res.set('Cache-Control', 'private, max-age=300');
  } else {
    // Default: short cache for data endpoints (1 minute)
    res.set('Cache-Control', 'private, max-age=60');
  }
  
  next();
});

// Routes - Direct require
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/branches', require('./routes/branchRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/forms', require('./routes/formRoutes'));
app.use('/api/receipts', require('./routes/receiptRoutes'));
app.use('/api/enquiries', require('./routes/enquiryRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/collections', require('./routes/collectionRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/amc', require('./routes/amcRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/service-rates', require('./routes/serviceRateRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/travel-logs', require('./routes/travelLogRoutes'));
app.use('/api/purchase-requests', require('./routes/purchaseRequestRoutes'));
app.use('/api/hq-purchases', require('./routes/hqPurchaseRoutes'));
app.use('/api/branch-transfers', require('./routes/branchTransferRoutes'));
app.use('/api/employee-distributions', require('./routes/employeeDistributionRoutes'));
app.use('/api/employee-inventory', require('./routes/employeeInventoryRoutes'));
app.use('/api/stock-transfers', require('./routes/stockTransferRoutes'));
app.use('/api/hq-account', require('./routes/hqAccountRoutes'));
app.use('/api/ledger', require('./routes/ledgerRoutes'));
app.use('/api/task-assignments', require('./routes/taskAssignmentRoutes'));

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(errorHandler);

module.exports = app;