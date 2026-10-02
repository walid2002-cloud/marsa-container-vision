/**
 * Phase 7 — Gestion centralisée des preuves visuelles.
 * Enregistre chaque preuve (upload, caméra, démo) et fournit des URLs publiques
 * propres (jamais de chemin local /app/uploads/...).
 */
const crypto = require('crypto');
const { pool } = require('../config/database');
const {
  proofPublicUrl,
  proofDownloadUrl,
  proofThumbnailUrl,
} = require('../utils/publicUrl');
const { relativeProofUrl, relativeMediaFileUrl } = require('./proofAssetService');

let tableAvailable = null;
async function tableExists() {
  if (tableAvailable !== null) return tableAvailable;
  try {
    const [rows] = await pool.query("SHOW TABLES LIKE 'visual_proofs'");
    tableAvailable = rows.length > 0;
  } catch {
    tableAvailable = false;
  }
  return tableAvailable;
}

function normalizeCode(code) {
  return String(code || '').trim().replace(/[\s\-.]+/g, '').toUpperCase();
}

function toMysqlDateTime(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Enregistre une preuve visuelle (best-effort, non bloquant).
 * @returns {Promise<object|null>} preuve enrichie ou null.
 */
async function recordProof(p = {}) {
  const imagePath = p.image_path || p.imagePath || null;
  const imageUrl = p.image_url || p.imageUrl || null;
  if (!imagePath && !imageUrl) return null;
  if (!(await tableExists())) return null;

  const code = p.container_code ? normalizeCode(p.container_code) : null;
  const uuid = crypto.randomUUID();
  try {
    // Déduplication simple : même code + même image récente -> réutiliser.
    if (code && (imagePath || imageUrl)) {
      const [dup] = await pool.query(
        `SELECT proof_uuid FROM visual_proofs
          WHERE container_code = ? AND ((image_path = ? AND image_path IS NOT NULL) OR (image_url = ? AND image_url IS NOT NULL))
          ORDER BY id DESC LIMIT 1`,
        [code, imagePath, imageUrl]
      );
      if (dup[0]) return getProofByUuid(dup[0].proof_uuid);
    }
    await pool.query(
      `INSERT INTO visual_proofs
        (proof_uuid, container_code, image_path, image_url, source, camera_id, zone, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid, code, imagePath, imageUrl,
        p.source || null, p.camera_id || p.cameraId || null,
        p.zone || null, toMysqlDateTime(p.captured_at || p.capturedAt),
      ]
    );
    return getProofByUuid(uuid);
  } catch (e) {
    if (!/doesn't exist/i.test(e.message)) console.warn('[Proofs] recordProof :', e.message);
    return null;
  }
}

/** Sérialise une preuve pour l'API (URLs publiques uniquement, pas de chemin local). */
function serialize(row) {
  if (!row) return null;
  const apiUrl = relativeProofUrl(row.proof_uuid) || relativeMediaFileUrl(row.image_path || row.image_url);
  const directUrl = row.image_url || proofPublicUrl(row.image_path);
  return {
    proof_id: row.proof_uuid,
    id: row.proof_uuid,
    container_code: row.container_code,
    source: row.source || 'unknown',
    camera_id: row.camera_id || null,
    camera: row.camera_id || null,
    zone: row.zone || null,
    captured_at: row.captured_at || null,
    created_at: row.created_at || null,
    image_url: apiUrl,
    originalUrl: apiUrl,
    annotatedUrl: apiUrl,
    public_url: proofDownloadUrl(row.proof_uuid) || apiUrl,
    thumbnail_url: proofThumbnailUrl(row.proof_uuid) || apiUrl,
    available: Boolean(apiUrl || directUrl),
  };
}

async function getProofByUuid(uuid) {
  if (!(await tableExists())) return null;
  try {
    const [rows] = await pool.query('SELECT * FROM visual_proofs WHERE proof_uuid = ? LIMIT 1', [uuid]);
    return serialize(rows[0]);
  } catch {
    return null;
  }
}

/** Renvoie le row brut (pour servir l'image / redirection). */
async function getRawProof(uuid) {
  if (!(await tableExists())) return null;
  try {
    const [rows] = await pool.query('SELECT * FROM visual_proofs WHERE proof_uuid = ? LIMIT 1', [uuid]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function getProofsForContainer(code, limit = 20) {
  if (!(await tableExists())) return proofsFromTracking(code, limit);
  const c = normalizeCode(code);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  try {
    const [rows] = await pool.query(
      'SELECT * FROM visual_proofs WHERE container_code = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      [c, lim]
    );
    if (rows.length) return rows.map(serialize);
  } catch {
    /* fallback tracking */
  }
  return proofsFromTracking(c, lim);
}

async function proofsFromTracking(code, limit = 20) {
  const c = normalizeCode(code);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const out = [];
  try {
    const [mov] = await pool.query(
      `SELECT id, camera_id, camera_name, zone, proof_image_url, proof_image_path, detected_at, confidence
       FROM container_movements
       WHERE container_code = ? AND (proof_image_url IS NOT NULL OR proof_image_path IS NOT NULL)
       ORDER BY detected_at DESC, id DESC
       LIMIT ?`,
      [c, lim]
    );
    for (const m of mov) {
      const src = m.proof_image_url || m.proof_image_path;
      const apiUrl = relativeMediaFileUrl(src);
      out.push({
        proof_id: `mov-${m.id}`,
        id: `mov-${m.id}`,
        camera_id: m.camera_id || m.camera_name,
        camera: m.camera_name || m.camera_id,
        zone: m.zone,
        captured_at: m.detected_at,
        confidence: m.confidence != null ? Number(m.confidence) : null,
        image_url: apiUrl,
        originalUrl: apiUrl,
        annotatedUrl: apiUrl,
        source: 'movement',
        available: Boolean(apiUrl),
      });
    }
  } catch (e) {
    console.warn('[Proofs] tracking fallback :', e.message);
  }
  if (out.length) return out;
  try {
    const [det] = await pool.query(
      `SELECT id, camera_name, zone, image_path, annotated_path, detected_at, confidence
       FROM detections
       WHERE container_code = ? AND (image_path IS NOT NULL OR annotated_path IS NOT NULL)
       ORDER BY id DESC
       LIMIT ?`,
      [c, lim]
    );
    for (const d of det) {
      const src = d.annotated_path || d.image_path;
      const apiUrl = relativeMediaFileUrl(src);
      out.push({
        proof_id: `det-${d.id}`,
        id: `det-${d.id}`,
        camera_id: d.camera_name,
        camera: d.camera_name,
        zone: d.zone,
        captured_at: d.detected_at,
        confidence: d.confidence != null ? Number(d.confidence) : null,
        image_url: apiUrl,
        originalUrl: relativeMediaFileUrl(d.image_path) || apiUrl,
        annotatedUrl: relativeMediaFileUrl(d.annotated_path) || apiUrl,
        source: 'detection',
        available: Boolean(apiUrl),
      });
    }
  } catch (e) {
    console.warn('[Proofs] detections fallback :', e.message);
  }
  return out;
}

async function getLatestProofForContainer(code) {
  const list = await getProofsForContainer(code, 1);
  return list[0] || null;
}

module.exports = {
  recordProof,
  getProofByUuid,
  getRawProof,
  getProofsForContainer,
  getLatestProofForContainer,
  serialize,
};
