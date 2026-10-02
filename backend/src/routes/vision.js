const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { uploadSync, uploadAsync, getJobStatus, listVisionUploads, analyzeOnly, persistDetection, listReviewQueue } = require('../controllers/visionController');

const MAX_VISION_BYTES = 40 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VISION_BYTES },
});

router.post('/vision/analyze', authenticateToken, requirePermission('uploads.create'), upload.single('file'), analyzeOnly);
router.post('/vision/detections', authenticateToken, requirePermission('uploads.create'), persistDetection);
router.get('/vision/review', authenticateToken, requirePermission('uploads.read'), listReviewQueue);
router.post('/vision/upload', authenticateToken, requirePermission('uploads.create'), upload.single('file'), uploadSync);
router.post('/vision/jobs', authenticateToken, requirePermission('uploads.create'), upload.single('file'), uploadAsync);
router.get('/vision/jobs/:id', authenticateToken, requirePermission('uploads.read'), getJobStatus);
router.get('/vision/uploads', authenticateToken, requirePermission('uploads.read'), listVisionUploads);

module.exports = router;
