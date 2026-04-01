const express = require('express');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', (req, res) => {
  try {
    const { file } = req.body;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }

    if (typeof file !== 'string' || !file.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed'
      });
    }

    const base64Data = file.split(',')[1];
    if (!base64Data) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image format'
      });
    }

    const sizeInBytes = (base64Data.length * 3) / 4;
    const maxSize = 5 * 1024 * 1024;
    
    if (sizeInBytes > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Max 5MB allowed.'
      });
    }

    res.status(200).json({
      success: true,
      data: file
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Upload failed: ' + error.message
    });
  }
});

module.exports = router;
