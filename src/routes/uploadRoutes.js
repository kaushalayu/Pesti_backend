const express = require('express');
const upload = require('../utils/upload');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @desc    Upload file
// @route   POST /api/upload
// @access  Private
router.use(protect);

router.post('/', upload.single('file'), (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file provided', 400));
  }

  const filePath = `/uploads/${req.file.filename}`;

  res.status(200).json({
    success: true,
    data: filePath
  });
});

module.exports = router;
