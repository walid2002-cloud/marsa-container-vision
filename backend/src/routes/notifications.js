const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getNotifications } = require('../controllers/notificationController');

// Notifications "dashboard" historiques (cloche) — déplacées pour laisser
// /api/notifications au système multi-canal (Phase 4). Compat maintenue.
router.get('/dashboard-notifications', authenticateToken, getNotifications);

module.exports = router;
