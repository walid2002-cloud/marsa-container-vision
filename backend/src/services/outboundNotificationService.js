/**
 * Service central des notifications multi-canal (Phase 4).
 *
 * - Ne bloque jamais l'application : toute erreur d'envoi est capturée et
 *   enregistrée (status 'failed'), l'alerte reste créée.
 * - Mode simulation par défaut : logProvider journalise sans envoyer réellement.
 * - Déduplication : pas de doublon actif pour (alert_id, channel, recipient)
 *   dans une fenêtre de temps, sauf renvoi manuel (force) ou escalade.
 */
const crypto = require('crypto');
const { pool } = require('../config/database');
const { channelsForAlert } = require('../config/notificationRules');
const { ALERT_TYPES } = require('../config/alertTypes');

const providers = {
  whatsapp: require('./notificationProviders/whatsappProvider'),
  email: require('./notificationProviders/emailProvider'),
  sms: require('./notificationProviders/smsProvider'),
};

const MIN_RESEND_MINUTES = Number(process.env.NOTIFICATION_MIN_RESEND_MINUTES || 60);

function notificationsEnabled() {
  return process.env.NOTIFICATIONS_ENABLED !== 'false';
}
function simulationMode() {
  return process.env.NOTIFICATION_SIMULATION_MODE !== 'false';
}

/* ------------------------------ Paramètres ------------------------------ */

async function getSettings() {
  try {
    const [rows] = await pool.query('SELECT * FROM notification_settings ORDER BY channel');
    return rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      enabled: Boolean(r.enabled),
      provider: r.provider,
      default_recipient: r.default_recipient,
      config: r.config_json ? (typeof r.config_json === 'string' ? JSON.parse(r.config_json) : r.config_json) : null,
      updated_at: r.updated_at,
    }));
  } catch (e) {
    console.warn('[Notif] getSettings :', e.message);
    return [];
  }
}

async function getChannelSetting(channel) {
  try {
    const [rows] = await pool.query('SELECT * FROM notification_settings WHERE channel = ? LIMIT 1', [channel]);
    if (!rows[0]) return { channel, enabled: false, provider: 'simulation', default_recipient: null };
    return {
      channel,
      enabled: Boolean(rows[0].enabled),
      provider: rows[0].provider,
      default_recipient: rows[0].default_recipient,
    };
  } catch {
    return { channel, enabled: false, provider: 'simulation', default_recipient: null };
  }
}

async function updateSetting(channel, { enabled, default_recipient }) {
  const fields = [];
  const params = [];
  if (enabled !== undefined) { fields.push('enabled = ?'); params.push(enabled ? 1 : 0); }
  if (default_recipient !== undefined) { fields.push('default_recipient = ?'); params.push(default_recipient || null); }
  if (!fields.length) return getChannelSetting(channel);
  params.push(channel);
  await pool.query(`UPDATE notification_settings SET ${fields.join(', ')} WHERE channel = ?`, params);
  return getChannelSetting(channel);
}

/* ---------------------------- Sérialisation ----------------------------- */

function parseRow(r) {
  let details = null;
  if (r.details_json) {
    try { details = typeof r.details_json === 'string' ? JSON.parse(r.details_json) : r.details_json; } catch { details = null; }
  }
  return {
    id: r.id,
    notification_uuid: r.notification_uuid,
    alert_id: r.alert_id,
    alert_type: r.alert_type,
    severity: r.severity,
    channel: r.channel,
    recipient: r.recipient,
    subject: r.subject,
    message: r.message,
    status: r.status,
    provider: r.provider,
    simulated: Boolean(r.simulated),
    error_message: r.error_message,
    details,
    sent_at: r.sent_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/* ------------------------------ CRUD -------------------------------- */

async function createNotification(payload) {
  const [ins] = await pool.query(
    `INSERT INTO outbound_notifications (
       notification_uuid, alert_id, alert_type, severity, channel, recipient,
       subject, message, status, provider, simulated, error_message, details_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(), payload.alert_id || null, payload.alert_type || null,
      payload.severity || null, payload.channel, payload.recipient || null,
      payload.subject || null, payload.message, payload.status || 'pending',
      payload.provider || null, payload.simulated ? 1 : 0, payload.error_message || null,
      payload.details ? JSON.stringify(payload.details) : null,
    ]
  );
  return ins.insertId;
}

async function getNotifications(filters = {}) {
  const where = [];
  const params = [];
  if (filters.channel) { where.push('channel = ?'); params.push(filters.channel); }
  if (filters.status) { where.push('status = ?'); params.push(filters.status); }
  if (filters.alert_type) { where.push('alert_type = ?'); params.push(filters.alert_type); }
  if (filters.recipient) { where.push('recipient LIKE ?'); params.push(`%${filters.recipient}%`); }
  if (filters.date) { where.push('DATE(created_at) = ?'); params.push(filters.date); }
  const lim = Math.min(Math.max(parseInt(filters.limit, 10) || 100, 1), 500);
  try {
    const [rows] = await pool.query(
      `SELECT * FROM outbound_notifications
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC, id DESC LIMIT ${lim}`,
      params
    );
    return rows.map(parseRow);
  } catch (e) {
    console.warn('[Notif] getNotifications :', e.message);
    return [];
  }
}

async function getNotificationById(id) {
  try {
    const [rows] = await pool.query('SELECT * FROM outbound_notifications WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? parseRow(rows[0]) : null;
  } catch { return null; }
}

async function getNotificationsForAlert(alertId) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM outbound_notifications WHERE alert_id = ? ORDER BY created_at DESC', [alertId]
    );
    return rows.map(parseRow);
  } catch { return []; }
}

async function getNotificationsForAlertIds(ids) {
  const map = {};
  if (!Array.isArray(ids) || ids.length === 0) return map;
  try {
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT * FROM outbound_notifications WHERE alert_id IN (${placeholders})
       ORDER BY created_at DESC`,
      ids
    );
    rows.forEach((r) => {
      const n = parseRow(r);
      if (!map[n.alert_id]) map[n.alert_id] = [];
      map[n.alert_id].push(n);
    });
  } catch (e) {
    console.warn('[Notif] getNotificationsForAlertIds :', e.message);
  }
  return map;
}

async function markNotificationFailed(id, errorMessage) {
  try {
    await pool.query(
      `UPDATE outbound_notifications SET status='failed', error_message=? WHERE id=?`,
      [String(errorMessage || '').slice(0, 500), id]
    );
  } catch (e) { console.warn('[Notif] markNotificationFailed :', e.message); }
}

/* --------------------------- Envoi effectif --------------------------- */

async function performSend(notification) {
  const provider = providers[notification.channel];
  if (!provider) {
    await markNotificationFailed(notification.id, 'Canal non supporté');
    return { status: 'failed' };
  }
  try {
    const result = await provider.send({
      channel: notification.channel,
      recipient: notification.recipient,
      subject: notification.subject,
      message: notification.message,
      simulationMode: simulationMode(),
    });
    await pool.query(
      `UPDATE outbound_notifications
       SET status=?, provider=?, simulated=?, error_message=?, sent_at=CASE WHEN ?='sent' THEN NOW() ELSE sent_at END
       WHERE id=?`,
      [result.status, result.provider || null, result.simulated ? 1 : 0,
       result.error || null, result.status, notification.id]
    );
    return result;
  } catch (e) {
    await markNotificationFailed(notification.id, e.message);
    return { status: 'failed', error: e.message };
  }
}

/** Renvoi manuel d'une notification (échouée ou non). */
async function retryNotification(id) {
  const notif = await getNotificationById(id);
  if (!notif) return null;
  await pool.query(`UPDATE outbound_notifications SET status='pending', error_message=NULL WHERE id=?`, [id]);
  const res = await performSend({ ...notif, status: 'pending' });
  return { ...(await getNotificationById(id)), send_result: res };
}

/* ----------------------- Déclenchement par alerte ---------------------- */

function buildMessage(alert) {
  const label = ALERT_TYPES[alert.type]?.label || alert.type;
  const parts = [`🚨 ${label}`];
  if (alert.container_code) parts.push(`Conteneur : ${alert.container_code}`);
  if (alert.zone) parts.push(`Zone : ${alert.zone}`);
  if (alert.camera_name) parts.push(`Caméra : ${alert.camera_name}`);
  parts.push(alert.message);
  return parts.join('\n');
}

async function hasRecentNotification(alertId, channel, recipient) {
  try {
    const [rows] = await pool.query(
      `SELECT id FROM outbound_notifications
       WHERE alert_id = ? AND channel = ?
         AND (recipient <=> ?)
         AND status IN ('sent','pending')
         AND created_at > (NOW() - INTERVAL ? MINUTE)
       ORDER BY id DESC LIMIT 1`,
      [alertId, channel, recipient || null, MIN_RESEND_MINUTES]
    );
    return Boolean(rows[0]);
  } catch { return false; }
}

/**
 * Crée et envoie les notifications pour une alerte selon les règles.
 * @param {object} alert  (id, type, severity, container_code, zone, camera_*, message, proof_image_url)
 * @param {object} opts   { force }
 * @returns {Promise<Array>} notifications créées
 */
async function sendAlertNotification(alert, opts = {}) {
  const created = [];
  if (!notificationsEnabled()) return created;

  const channels = channelsForAlert(alert.type, alert.severity);
  if (!channels.length) return created;

  const subject = `[${(alert.severity || '').toUpperCase()}] ${ALERT_TYPES[alert.type]?.label || alert.type}` +
    `${alert.container_code ? ` — ${alert.container_code}` : ''}`;
  const message = buildMessage(alert);

  for (const channel of channels) {
    const setting = await getChannelSetting(channel);
    const recipient = (alert.details && alert.details.recipient) || setting.default_recipient;

    // Canal désactivé -> on trace un "skipped".
    if (!setting.enabled) {
      const id = await createNotification({
        alert_id: alert.id, alert_type: alert.type, severity: alert.severity,
        channel, recipient, subject, message, status: 'skipped',
        provider: setting.provider, error_message: 'Canal désactivé',
        details: { reason: 'channel_disabled' },
      });
      created.push(await getNotificationById(id));
      continue;
    }

    // Pas de destinataire -> skipped.
    if (!recipient) {
      const id = await createNotification({
        alert_id: alert.id, alert_type: alert.type, severity: alert.severity,
        channel, recipient: null, subject, message, status: 'skipped',
        provider: setting.provider, error_message: 'Aucun destinataire configuré',
        details: { reason: 'no_recipient' },
      });
      created.push(await getNotificationById(id));
      continue;
    }

    // Déduplication (sauf renvoi forcé).
    if (!opts.force && await hasRecentNotification(alert.id, channel, recipient)) {
      continue;
    }

    const id = await createNotification({
      alert_id: alert.id, alert_type: alert.type, severity: alert.severity,
      channel, recipient, subject, message, status: 'pending', provider: setting.provider,
      details: { rule: 'auto', force: Boolean(opts.force) },
    });
    const notif = await getNotificationById(id);
    await performSend(notif);
    created.push(await getNotificationById(id));
  }
  return created;
}

/* ------------------------------ Statistiques --------------------------- */

async function getNotificationStats() {
  const empty = { total: 0, sent: 0, failed: 0, pending: 0, skipped: 0, simulated: 0, by_channel: {}, by_alert_type: {}, sent_today: 0 };
  try {
    const [[c]] = await pool.query(
      `SELECT COUNT(*) total,
              SUM(status='sent') sent,
              SUM(status='failed') failed,
              SUM(status='pending') pending,
              SUM(status='skipped') skipped,
              SUM(simulated=1) simulated,
              SUM(status='sent' AND DATE(sent_at)=CURDATE()) sent_today
       FROM outbound_notifications`
    );
    const [byChannel] = await pool.query(
      `SELECT channel, COUNT(*) n FROM outbound_notifications GROUP BY channel`
    );
    const [byType] = await pool.query(
      `SELECT alert_type, COUNT(*) n FROM outbound_notifications WHERE alert_type IS NOT NULL GROUP BY alert_type`
    );
    const by_channel = {};
    byChannel.forEach((r) => { by_channel[r.channel] = Number(r.n); });
    const by_alert_type = {};
    byType.forEach((r) => { by_alert_type[r.alert_type] = Number(r.n); });
    const topChannel = Object.entries(by_channel).sort((a, b) => b[1] - a[1])[0];
    return {
      total: Number(c.total || 0),
      sent: Number(c.sent || 0),
      failed: Number(c.failed || 0),
      pending: Number(c.pending || 0),
      skipped: Number(c.skipped || 0),
      simulated: Number(c.simulated || 0),
      sent_today: Number(c.sent_today || 0),
      top_channel: topChannel ? topChannel[0] : null,
      by_channel,
      by_alert_type,
    };
  } catch (e) {
    console.warn('[Notif] getNotificationStats :', e.message);
    return empty;
  }
}

module.exports = {
  getSettings,
  getChannelSetting,
  updateSetting,
  createNotification,
  getNotifications,
  getNotificationById,
  getNotificationsForAlert,
  getNotificationsForAlertIds,
  markNotificationFailed,
  retryNotification,
  sendAlertNotification,
  getNotificationStats,
  simulationMode,
  notificationsEnabled,
};
