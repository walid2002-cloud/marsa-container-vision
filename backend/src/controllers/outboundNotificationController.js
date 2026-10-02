const notifService = require('../services/outboundNotificationService');
const alertService = require('../services/alertService');
const { recordAudit } = require('../services/auditService');
const { maskSecretsDeep } = require('../utils/maskSecret');

async function listNotifications(req, res, next) {
  try {
    const filters = {
      channel: req.query.channel,
      status: req.query.status,
      alert_type: req.query.alert_type,
      recipient: req.query.recipient,
      date: req.query.date,
      limit: req.query.limit,
    };
    const data = await notifService.getNotifications(filters);
    await recordAudit({ admin: req.admin, action: 'notifications.list', entity: 'notifications' });
    return res.json({ success: true, data, count: data.length });
  } catch (err) { next(err); }
}

async function notificationStats(req, res, next) {
  try {
    const data = await notifService.getNotificationStats();
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getNotification(req, res, next) {
  try {
    const n = await notifService.getNotificationById(req.params.id);
    if (!n) return res.status(404).json({ success: false, error: 'Notification introuvable.' });
    return res.json({ success: true, data: n });
  } catch (err) { next(err); }
}

async function retryNotification(req, res, next) {
  try {
    const result = await notifService.retryNotification(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Notification introuvable.' });
    // Traçabilité : qui a relancé la notification.
    try {
      const { pool } = require('../config/database');
      const by = req.admin?.full_name || req.admin?.email || 'admin';
      await pool.query('UPDATE outbound_notifications SET retried_by = ? WHERE id = ?', [by, req.params.id]);
    } catch (_) { /* colonne optionnelle */ }
    await recordAudit({ admin: req.admin, action: 'notifications.retry', entity: 'notification', entity_id: req.params.id });
    return res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function getSettings(req, res, next) {
  try {
    const data = await notifService.getSettings();
    // Phase 6 : masquer les secrets (tokens WhatsApp/Meta, mots de passe SMTP, clés SMS)
    // avant de renvoyer la configuration au frontend.
    const masked = maskSecretsDeep(data);
    return res.json({
      success: true,
      data: masked,
      simulation_mode: notifService.simulationMode(),
      notifications_enabled: notifService.notificationsEnabled(),
    });
  } catch (err) { next(err); }
}

async function updateSettings(req, res, next) {
  try {
    const { channel, enabled, default_recipient } = req.body;
    if (!channel) return res.status(400).json({ success: false, error: 'Le champ channel est requis.' });
    const updated = await notifService.updateSetting(channel, { enabled, default_recipient });
    await recordAudit({
      admin: req.admin, action: 'notifications.settings.update', entity: 'notification_settings',
      entity_id: channel, details: { enabled, default_recipient_set: default_recipient !== undefined },
    });
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

/** Envoi / renvoi manuel de notification pour une alerte donnée. */
async function sendForAlert(req, res, next) {
  try {
    const alert = await alertService.getAlertById(req.params.alertId);
    if (!alert) return res.status(404).json({ success: false, error: 'Alerte introuvable.' });
    const created = await notifService.sendAlertNotification(alert, { force: true });
    await recordAudit({ admin: req.admin, action: 'notifications.send_manual', entity: 'alert', entity_id: alert.id });
    return res.json({ success: true, data: created, count: created.length });
  } catch (err) { next(err); }
}

module.exports = {
  listNotifications,
  notificationStats,
  getNotification,
  retryNotification,
  getSettings,
  updateSettings,
  sendForAlert,
};
