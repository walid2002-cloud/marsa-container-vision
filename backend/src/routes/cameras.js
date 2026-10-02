const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const {
  listCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  testCamera,
  cameraSnapshot,
  cameraStream,
  cameraDetections,
  cameraLatest,
  camerasLiveBoard,
  analyzeCamera,
  scanAllCameras,
  cameraFrames,
  cameraNextFrame,
  attachFrameToCamera,
  pairCamera,
  listCameraQrCatalog,
  startInspectionSession,
  endInspectionSession,
} = require('../controllers/cameraController');

router.get('/cameras', authenticateToken, requirePermission('cameras.read'), listCameras);
router.post('/cameras', authenticateToken, requirePermission('cameras.manage'), createCamera);
router.get('/cameras/qr-catalog', authenticateToken, requirePermission('cameras.read'), listCameraQrCatalog);
router.post('/cameras/pair', authenticateToken, requirePermission('cameras.read'), pairCamera);
router.post('/cameras/sessions', authenticateToken, requirePermission('cameras.read'), startInspectionSession);
router.post('/cameras/sessions/:id/end', authenticateToken, requirePermission('cameras.read'), endInspectionSession);
router.get('/cameras/live-board', authenticateToken, requirePermission('cameras.read'), camerasLiveBoard);
router.post('/cameras/scan-all', authenticateToken, requirePermission('cameras.manage'), scanAllCameras);

router.get('/cameras/:id/snapshot', authenticateToken, requirePermission('cameras.read'), cameraSnapshot);
router.get('/cameras/:id/stream', authenticateToken, requirePermission('cameras.read'), cameraStream);
router.get('/cameras/:id/detections', authenticateToken, requirePermission('cameras.read'), cameraDetections);
router.post('/cameras/:id/test', authenticateToken, requirePermission('cameras.manage'), testCamera);
router.patch('/cameras/:id', authenticateToken, requirePermission('cameras.manage'), updateCamera);
router.delete('/cameras/:id', authenticateToken, requirePermission('cameras.manage'), deleteCamera);
router.get('/cameras/:id', authenticateToken, requirePermission('cameras.read'), getCamera);

router.post('/cameras/:id/analyze', authenticateToken, requirePermission('cameras.manage'), analyzeCamera);
router.get('/cameras/:id/latest', authenticateToken, requirePermission('cameras.read'), cameraLatest);
router.get('/cameras/:id/frames', authenticateToken, requirePermission('cameras.read'), cameraFrames);
router.post('/cameras/:id/next-frame', authenticateToken, requirePermission('cameras.manage'), cameraNextFrame);
router.post('/cameras/:id/attach-frame', authenticateToken, requirePermission('cameras.manage'), attachFrameToCamera);

module.exports = router;
