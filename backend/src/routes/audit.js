const express = require('express');
const router = express.Router();
const { listAuditLogs, auditStats } = require('../controllers/auditController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

router.get('/audit-logs', authenticateToken, requirePermission('audit.read'), listAuditLogs);
router.get('/audit-logs/stats', authenticateToken, requirePermission('audit.read'), auditStats);

module.exports = router;
