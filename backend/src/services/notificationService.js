const { query } = require('../config/database');

async function createNotification({ type = 'info', title, message, payload = null }) {
  try {
    const payloadJson = payload ? JSON.stringify(payload) : null;
    await query(
      `INSERT INTO notifications (type, title, message, payload) VALUES (?, ?, ?, ?)`,
      [type, title, message || '', payloadJson]
    );
  } catch (e) {
    console.warn('[Notifications] Insert échoué :', e.message);
  }
}

async function listNotifications(limit = 50) {
  try {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const rows = await query(
      `SELECT id, type, title, message, payload, is_read AS isRead, created_at AS createdAt
       FROM notifications ORDER BY id DESC LIMIT ?`,
      [lim]
    );
    return rows.map((r) => ({
      ...r,
      payload: r.payload
        ? (() => {
            try {
              return JSON.parse(r.payload);
            } catch {
              return null;
            }
          })()
        : null,
    }));
  } catch (e) {
    console.warn('[Notifications] Liste :', e.message);
    return [];
  }
}

module.exports = { createNotification, listNotifications };
