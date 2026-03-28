const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const AppError = require('./utils/AppError');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// Security & Logs
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ 
  origin: [
    process.env.FRONTEND_URL || 'https://pestiside-liart.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ],
  credentials: true 
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Global Logging for debugging 404s
app.use((req, res, next) => {
  if (req.originalUrl !== '/favicon.ico') {
     console.log(`[Global Server] ${req.method} ${req.originalUrl}`);
  }
  next();
});

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Static assets
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root Central Router (Consolidated for Express 5 prefix matching)
app.use('/api', apiRoutes);

// Catch-all 404 (Operational Error)
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Central Error Management
app.use(errorHandler);

module.exports = app;
