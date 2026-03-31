const express = require('express');
const { getCollectionStats, getAllCollections, getCollectionById } = require('../controllers/collectionController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Collections route working!' });
});

// GET / - List all collections
router.get('/', getAllCollections);

// GET /stats - Collection stats
router.get('/stats', restrictTo('super_admin', 'branch_admin'), getCollectionStats);

// GET /:id - Get single collection
router.get('/:id', getCollectionById);

module.exports = router;
