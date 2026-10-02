const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { getSettings, updateSettings } = require('../controllers/settingsController');

router.get('/settings', authenticateToken, getSettings);
router.patch('/settings', authenticateToken, requirePermission('settings.manage'), updateSettings);

module.exports = router;
