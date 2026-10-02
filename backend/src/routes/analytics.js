const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getSummary } = require('../controllers/analyticsController');

router.get('/analytics/summary', authenticateToken, getSummary);

module.exports = router;
