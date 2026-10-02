const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getStatus } = require('../controllers/systemController');

// État des services (dashboard) — accessible à tout utilisateur authentifié.
router.get('/system/status', authenticateToken, getStatus);

module.exports = router;
