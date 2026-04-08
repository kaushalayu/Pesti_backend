const express = require('express');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Allowed MIME types for base64 uploads
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

router.post('/', (req, res) => {
  try {
    const { file } = req.body;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    if (typeof file !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid file format' });
    }

    // Validate data URI format
    const dataUriRegex = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+);base64,(.+)$/;
    const match = file.match(dataUriRegex);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Invalid base64 data URI format' });
    }

    const mimeType = match[1].toLowerCase();
    const base64Data = match[2];

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        message: `File type not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      });
    }

    // Validate base64 characters (prevent injection)
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      return res.status(400).json({ success: false, message: 'Invalid base64 encoding' });
    }

    // Check file size
    const sizeInBytes = (base64Data.length * 3) / 4;
    if (sizeInBytes > MAX_SIZE_BYTES) {
      return res.status(400).json({ success: false, message: 'File too large. Max 5MB allowed.' });
    }

    // Save to disk with safe filename
    const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
    const safeExt = ['jpg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
    const filename = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${safeExt}`;
    const uploadsDir = path.join(__dirname, '../uploads');
    const filePath = path.join(uploadsDir, filename);

    // Ensure uploads dir exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    res.status(200).json({
      success: true,
      data: `/uploads/${filename}`,
      mimeType,
      sizeKB: Math.round(sizeInBytes / 1024),
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed: ' + error.message });
  }
});

module.exports = router;
