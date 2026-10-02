const express = require('express');
const router = express.Router();
const {
  getDetections,
  getDetectionById,
  getSearchHistory,
} = require('../controllers/detectionController');
const { reviewDetection } = require('../controllers/detectionReviewController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

router.get('/detections', authenticateToken, requirePermission('containers.read_tracking'), getDetections);
router.get('/detections/:id', authenticateToken, requirePermission('containers.read_tracking'), getDetectionById);
router.get('/search-history', authenticateToken, requirePermission('containers.read_tracking'), getSearchHistory);
router.post('/detections/review', authenticateToken, requirePermission('containers.manage_tracking'), reviewDetection);

module.exports = router;
