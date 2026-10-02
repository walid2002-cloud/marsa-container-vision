const audit = require('../services/auditService');

async function listAuditLogs(req, res, next) {
  try {
    const filters = {
      action: req.query.action,
      status: req.query.status,
      resource_type: req.query.resource_type,
      admin_id: req.query.admin_id,
      actor: req.query.actor,
      method: req.query.method,
      path: req.query.path,
      date: req.query.date,
      limit: req.query.limit,
    };
    const logs = await audit.getAuditLogs(filters);
    return res.json({ success: true, data: logs, count: logs.length });
  } catch (err) {
    next(err);
  }
}

async function auditStats(req, res, next) {
  try {
    const stats = await audit.getAuditStats();
    return res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLogs, auditStats };
