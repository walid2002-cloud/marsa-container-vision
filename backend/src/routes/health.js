const express = require('express');
const router = express.Router();
const { testConnection } = require('../config/database');

// GET /api/health
router.get('/health', async (req, res) => {
  const dbStatus = await testConnection();

  res.json({
    status: 'ok',
    service: 'marsa-container-backend',
    timestamp: new Date().toISOString(),
    database: dbStatus ? 'connected' : 'disconnected',
  });
});

router.get('/ready', async (req, res) => {
  const dbStatus = await testConnection();
  const ready = dbStatus;
  res.json({
    ready,
    service: 'marsa-container-backend',
    timestamp: new Date().toISOString(),
    database: dbStatus ? 'connected' : 'disconnected',
  });
});

module.exports = router;
