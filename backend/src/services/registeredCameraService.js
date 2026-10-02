const { pool } = require('../config/database');
const {
  encryptSecret,
  decryptSecret,
  maskRtspUrl,
  buildRtspUrl,
} = require('./cameraCredentialService');

function publicRow(row) {
  if (!row) return null;
  const configured = Boolean(row.rtsp_host_url);
  return {
    id: row.camera_id,
    db_id: row.id,
    name: row.name,
    zone: row.zone,
    type: row.camera_type,
    camera_type: row.camera_type,
    status: row.active ? 'active' : 'inactive',
    active: Boolean(row.active),
    rtsp_configured: configured,
    rtsp_masked: configured ? maskRtspUrl(row.rtsp_host_url) : null,
    scan_interval_seconds: row.scan_interval_seconds,
    last_test_ok: row.last_test_ok == null ? null : Boolean(row.last_test_ok),
    last_test_at: row.last_test_at,
    last_test_error: row.last_test_error,
    last_snapshot_at: row.last_snapshot_at,
    created_at: row.created_at,
  };
}

async function listRegistered() {
  try {
    const [rows] = await pool.query(`SELECT * FROM registered_cameras ORDER BY camera_id ASC`);
    return rows.map(publicRow);
  } catch (e) {
    console.warn('[Cameras] listRegistered :', e.message);
    return [];
  }
}

async function getRegistered(cameraId) {
  const [rows] = await pool.query(`SELECT * FROM registered_cameras WHERE camera_id = ? LIMIT 1`, [
    cameraId,
  ]);
  return rows[0] || null;
}

async function upsertRegistered(body) {
  const cameraId = String(body.camera_id || body.id || '').trim().toUpperCase();
  const name = String(body.name || cameraId).trim();
  const zone = body.zone || null;
  const type = body.camera_type || body.type || 'rtsp';
  const hostUrl = (body.rtsp_url || body.rtsp_host_url || '').trim() || null;
  const username = (body.rtsp_username || body.rtsp_user || '').trim() || null;
  const password = body.rtsp_password != null && body.rtsp_password !== ''
    ? String(body.rtsp_password)
    : undefined;
  const interval = Math.min(Math.max(parseInt(body.scan_interval_seconds, 10) || 5, 1), 3600);
  const active = body.active === false || body.active === 0 || body.active === 'inactive' ? 0 : 1;

  if (!cameraId) {
    const err = new Error('ID caméra requis.');
    err.status = 400;
    throw err;
  }

  const existing = await getRegistered(cameraId);
  let passwordEnc = existing?.rtsp_password_enc || null;
  if (password !== undefined) {
    passwordEnc = encryptSecret(password);
  }

  if (existing) {
    await pool.query(
      `UPDATE registered_cameras
       SET name = ?, zone = ?, camera_type = ?, rtsp_host_url = ?, rtsp_username = ?,
           rtsp_password_enc = ?, scan_interval_seconds = ?, active = ?
       WHERE camera_id = ?`,
      [name, zone, type, hostUrl, username, passwordEnc, interval, active, cameraId]
    );
  } else {
    await pool.query(
      `INSERT INTO registered_cameras (
         camera_id, name, zone, camera_type, rtsp_host_url, rtsp_username, rtsp_password_enc,
         scan_interval_seconds, active
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cameraId, name, zone, type, hostUrl, username, passwordEnc, interval, active]
    );
  }
  return publicRow(await getRegistered(cameraId));
}

async function removeRegistered(cameraId) {
  await pool.query(`DELETE FROM registered_cameras WHERE camera_id = ?`, [cameraId]);
}

async function decryptedRtspUrl(cameraId) {
  const row = await getRegistered(cameraId);
  if (!row || !row.rtsp_host_url) return null;
  const pass = decryptSecret(row.rtsp_password_enc);
  return buildRtspUrl(row.rtsp_host_url, row.rtsp_username, pass);
}

async function markTest(cameraId, { ok, error }) {
  await pool.query(
    `UPDATE registered_cameras SET last_test_ok = ?, last_test_at = NOW(), last_test_error = ? WHERE camera_id = ?`,
    [ok ? 1 : 0, error || null, cameraId]
  );
}

async function markSnapshot(cameraId) {
  await pool.query(`UPDATE registered_cameras SET last_snapshot_at = NOW() WHERE camera_id = ?`, [
    cameraId,
  ]);
}

module.exports = {
  publicRow,
  listRegistered,
  getRegistered,
  upsertRegistered,
  removeRegistered,
  decryptedRtspUrl,
  markTest,
  markSnapshot,
};
