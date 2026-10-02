/**
 * Paramètres système persistés (mode DEMO / PRODUCTION, etc.).
 */
const { pool } = require('../config/database');

const DEFAULTS = {
  app_mode: process.env.DETECTION_MODE === 'real' ? 'PRODUCTION' : 'DEMO',
  marsa_ai_url: process.env.MARSA_AI_URL || 'http://localhost:5173',
};

async function getSetting(key) {
  try {
    const [rows] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1', [key]);
    if (rows[0]?.setting_value != null) return rows[0].setting_value;
  } catch {
    /* table absente */
  }
  return DEFAULTS[key] ?? null;
}

async function getAllSettings() {
  const out = { ...DEFAULTS };
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    for (const r of rows) {
      out[r.setting_key] = r.setting_value;
    }
  } catch {
    /* table absente */
  }
  return out;
}

async function setSetting(key, value, adminId = null) {
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [key, String(value), adminId]
  );
  return getSetting(key);
}

async function getAppMode() {
  const mode = await getSetting('app_mode');
  return String(mode || 'DEMO').toUpperCase() === 'PRODUCTION' ? 'PRODUCTION' : 'DEMO';
}

module.exports = {
  DEFAULTS,
  getSetting,
  getAllSettings,
  setSetting,
  getAppMode,
};
