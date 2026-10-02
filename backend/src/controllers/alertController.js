const alertService = require('../services/alertService');
const { getNotificationsForAlertIds } = require('../services/outboundNotificationService');
const audit = require('../services/auditService');

async function listAlerts(req, res, next) {
  try {
    const filters = {
      type: req.query.type,
      severity: req.query.severity,
      status: req.query.status,
      container_code: req.query.container_code,
      zone: req.query.zone,
      date: req.query.date,
      limit: req.query.limit,
    };
    const alerts = await alertService.getAlerts(filters);
    // Phase 4 : attacher les notifications liées à chaque alerte.
    const notifMap = await getNotificationsForAlertIds(alerts.map((a) => a.id));
    const enriched = alerts.map((a) => ({ ...a, notifications: notifMap[a.id] || [] }));
    return res.json({ success: true, data: enriched, count: enriched.length });
  } catch (err) {
    next(err);
  }
}

async function alertStats(req, res, next) {
  try {
    const stats = await alertService.getStats();
    return res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

async function checkAlerts(req, res, next) {
  try {
    const summary = await alertService.runAllChecks();
    return res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}

async function getAlert(req, res, next) {
  try {
    const alert = await alertService.getAlertById(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alerte introuvable.' });
    }
    return res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
}

async function resolveAlert(req, res, next) {
  try {
    const by = req.admin?.full_name || req.admin?.email || 'admin';
    const ok = await alertService.resolveAlert(req.params.id, by);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Alerte introuvable ou déjà traitée.' });
    }
    await audit.logSuccess({ admin: req.admin, req, action: 'alert.resolve', resource_type: 'alert', resource_id: req.params.id });
    return res.json({ success: true, data: await alertService.getAlertById(req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function ignoreAlert(req, res, next) {
  try {
    const by = req.admin?.full_name || req.admin?.email || 'admin';
    const ok = await alertService.ignoreAlert(req.params.id, by);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Alerte introuvable ou déjà traitée.' });
    }
    await audit.logSuccess({ admin: req.admin, req, action: 'alert.ignore', resource_type: 'alert', resource_id: req.params.id });
    return res.json({ success: true, data: await alertService.getAlertById(req.params.id) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAlerts, alertStats, checkAlerts, getAlert, resolveAlert, ignoreAlert };
