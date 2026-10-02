const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const {
  listNotifications,
  notificationStats,
  getNotification,
  retryNotification,
  getSettings,
  updateSettings,
  sendForAlert,
} = require('../controllers/outboundNotificationController');

// Paramètres (avant /:id)
router.get('/notification-settings', authenticateToken, requirePermission('notifications.read'), getSettings);
router.put('/notification-settings', authenticateToken, requirePermission('notifications.manage_settings'), updateSettings);

// Notifications
router.get('/notifications', authenticateToken, requirePermission('notifications.read'), listNotifications);
router.get('/notifications/stats', authenticateToken, requirePermission('notifications.read'), notificationStats);
router.get('/notifications/:id', authenticateToken, requirePermission('notifications.read'), getNotification);
router.post('/notifications/:id/retry', authenticateToken, requirePermission('notifications.retry'), retryNotification);

// Envoi manuel lié à une alerte
router.post('/alerts/:alertId/notify', authenticateToken, requirePermission('notifications.retry'), sendForAlert);

module.exports = router;
