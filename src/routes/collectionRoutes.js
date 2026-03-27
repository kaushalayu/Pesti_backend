const express = require('express');
const { getCollectionStats } = require('../controllers/collectionController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use((req, res, next) => {
  console.log(`[CollectionRouter] Incoming: ${req.method} ${req.url}`);
  next();
});

router.use(protect);

// Explicitly handle BOTH with and without trailing slash for stats
router.get('/stats', getCollectionStats);
router.get('/stats/', getCollectionStats);

module.exports = router;
