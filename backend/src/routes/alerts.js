const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const {
  listAlerts,
  alertStats,
  checkAlerts,
  getAlert,
  resolveAlert,
  ignoreAlert,
} = require('../controllers/alertController');

// Routes spécifiques avant la route paramétrée /:id
router.get('/alerts', authenticateToken, requirePermission('alerts.read'), listAlerts);
router.get('/alerts/stats', authenticateToken, requirePermission('alerts.read'), alertStats);
router.post('/alerts/check', authenticateToken, requirePermission('alerts.manage'), checkAlerts);
router.get('/alerts/:id', authenticateToken, requirePermission('alerts.read'), getAlert);
router.post('/alerts/:id/resolve', authenticateToken, requirePermission('alerts.resolve'), resolveAlert);
router.post('/alerts/:id/ignore', authenticateToken, requirePermission('alerts.ignore'), ignoreAlert);

module.exports = router;
