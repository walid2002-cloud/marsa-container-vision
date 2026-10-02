/**
 * Service centralisé des alertes intelligentes (Phase 3).
 *
 * - CRUD alertes (create / list / get / resolve / ignore)
 * - Déduplication : une seule alerte ACTIVE par (type, conteneur, zone, caméra)
 * - Vérifications automatiques (positions anciennes, immobilisation, OCR, caméras, IA)
 * - Évaluation à chaud après chaque détection (evaluateContainerAlerts)
 */
const crypto = require('crypto');
const axios = require('axios');
const { pool } = require('../config/database');
const { SEVERITY, STATUS, ALERT_TYPES, THRESHOLDS } = require('../config/alertTypes');
const { formatElapsed } = require('../utils/timeElapsed');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

function normalizeCode(code) {
  return String(code || '').trim().replace(/[\s\-.]+/g, '').toUpperCase();
}

function buildDedupKey({ type, container_code, zone, camera_id }) {
  return [type, container_code || '', zone || '', camera_id || ''].join('|').slice(0, 190);
}

/**
 * Crée une alerte, ou met à jour l'alerte ACTIVE existante (déduplication).
 * @returns {Promise<{id:number, created:boolean}|null>}
 */
async function createAlert(payload) {
  const spec = ALERT_TYPES[payload.type];
  if (!spec) {
    console.warn('[Alertes] type inconnu :', payload.type);
    return null;
  }
  const containerCode = payload.container_code ? normalizeCode(payload.container_code) : null;
  const severity = payload.severity || spec.severity;
  const zone = payload.zone || null;
  const cameraId = payload.camera_id || null;
  const dedupKey = buildDedupKey({ type: payload.type, container_code: containerCode, zone, camera_id: cameraId });
  const detailsJson = payload.details ? JSON.stringify(payload.details) : null;

  const SEV_RANK = { info: 1, warning: 2, critical: 3 };

  try {
    let alertId;
    let created = false;
    let escalated = false;

    const [existing] = await pool.query(
      `SELECT id, severity FROM alerts WHERE dedup_key = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
      [dedupKey]
    );
    if (existing[0]) {
      escalated = (SEV_RANK[severity] || 0) > (SEV_RANK[existing[0].severity] || 0);
      await pool.query(
        `UPDATE alerts SET message = ?, severity = ?, proof_image_url = COALESCE(?, proof_image_url),
                camera_name = COALESCE(?, camera_name), source = COALESCE(?, source),
                details_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [payload.message, severity, payload.proof_image_url || null, payload.camera_name || null,
         payload.source || null, detailsJson, existing[0].id]
      );
      alertId = existing[0].id;
    } else {
      const [ins] = await pool.query(
        `INSERT INTO alerts (
           alert_uuid, type, severity, container_code, camera_id, camera_name, zone,
           message, status, proof_image_url, source, details_json, dedup_key
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        [
          crypto.randomUUID(), payload.type, severity, containerCode, cameraId,
          payload.camera_name || null, zone, payload.message,
          payload.proof_image_url || null, payload.source || null, detailsJson, dedupKey,
        ]
      );
      alertId = ins.insertId;
      created = true;
    }

    // Phase 4 : déclenchement des notifications (nouvelle alerte ou escalade de gravité).
    if (created || escalated) {
      try {
        const notifService = require('./outboundNotificationService');
        await notifService.sendAlertNotification({
          id: alertId,
          type: payload.type,
          severity,
          container_code: containerCode,
          zone,
          camera_id: cameraId,
          camera_name: payload.camera_name || null,
          message: payload.message,
          proof_image_url: payload.proof_image_url || null,
          details: payload.details || null,
        }, { force: escalated });
      } catch (ne) {
        console.warn('[Alertes] notification :', ne.message);
      }
    }

    return { id: alertId, created, escalated };
  } catch (e) {
    console.warn('[Alertes] createAlert :', e.message);
    return null;
  }
}

function parseDetails(row) {
  let details = null;
  if (row.details_json) {
    try {
      details = typeof row.details_json === 'string' ? JSON.parse(row.details_json) : row.details_json;
    } catch {
      details = null;
    }
  }
  return {
    id: row.id,
    alert_uuid: row.alert_uuid,
    type: row.type,
    type_label: ALERT_TYPES[row.type]?.label || row.type,
    severity: row.severity,
    container_code: row.container_code,
    camera_id: row.camera_id,
    camera_name: row.camera_name,
    zone: row.zone,
    message: row.message,
    status: row.status,
    proof_image_url: row.proof_image_url,
    source: row.source,
    details,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    resolved_by: row.resolved_by,
  };
}

async function getAlerts(filters = {}) {
  const where = [];
  const params = [];
  if (filters.type) { where.push('type = ?'); params.push(filters.type); }
  if (filters.severity) { where.push('severity = ?'); params.push(filters.severity); }
  if (filters.status) { where.push('status = ?'); params.push(filters.status); }
  if (filters.container_code) { where.push('container_code = ?'); params.push(normalizeCode(filters.container_code)); }
  if (filters.zone) { where.push('zone = ?'); params.push(filters.zone); }
  if (filters.date) { where.push('DATE(created_at) = ?'); params.push(filters.date); }

  const lim = Math.min(Math.max(parseInt(filters.limit, 10) || 100, 1), 500);
  const sql = `SELECT * FROM alerts
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY (status = 'active') DESC,
              FIELD(severity, 'critical', 'warning', 'info'),
              created_at DESC
     LIMIT ${lim}`;
  try {
    const [rows] = await pool.query(sql, params);
    return rows.map(parseDetails);
  } catch (e) {
    console.warn('[Alertes] getAlerts :', e.message);
    return [];
  }
}

async function getAlertById(id) {
  try {
    const [rows] = await pool.query('SELECT * FROM alerts WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? parseDetails(rows[0]) : null;
  } catch (e) {
    console.warn('[Alertes] getAlertById :', e.message);
    return null;
  }
}

async function getActiveAlertsForContainer(containerCode) {
  const code = normalizeCode(containerCode);
  if (!code) return [];
  try {
    const [rows] = await pool.query(
      `SELECT * FROM alerts WHERE container_code = ? AND status = 'active'
       ORDER BY FIELD(severity,'critical','warning','info'), created_at DESC`,
      [code]
    );
    return rows.map(parseDetails);
  } catch (e) {
    console.warn('[Alertes] getActiveAlertsForContainer :', e.message);
    return [];
  }
}

async function resolveAlert(id, resolvedBy = null) {
  try {
    const [r] = await pool.query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW(), resolved_by = ?
       WHERE id = ? AND status <> 'resolved'`,
      [resolvedBy, id]
    );
    return r.affectedRows > 0;
  } catch (e) {
    console.warn('[Alertes] resolveAlert :', e.message);
    return false;
  }
}

async function ignoreAlert(id, by = null) {
  // Tenter d'écrire ignored_by (Phase 6) ; repli si la colonne n'existe pas.
  try {
    const [r] = await pool.query(
      `UPDATE alerts SET status = 'ignored', resolved_at = NOW(), resolved_by = ?, ignored_by = ?
       WHERE id = ? AND status = 'active'`,
      [by, by, id]
    );
    return r.affectedRows > 0;
  } catch (e) {
    if (!/Unknown column/i.test(e.message)) {
      console.warn('[Alertes] ignoreAlert :', e.message);
    }
    try {
      const [r2] = await pool.query(
        `UPDATE alerts SET status = 'ignored', resolved_at = NOW(), resolved_by = ?
         WHERE id = ? AND status = 'active'`,
        [by, id]
      );
      return r2.affectedRows > 0;
    } catch (e2) {
      console.warn('[Alertes] ignoreAlert :', e2.message);
      return false;
    }
  }
}

/** Résout automatiquement les alertes actives d'un type/conteneur (ex. position redevenue fraîche). */
async function autoResolveByType(containerCode, type) {
  const code = normalizeCode(containerCode);
  if (!code) return;
  try {
    await pool.query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW(), resolved_by = 'system'
       WHERE container_code = ? AND type = ? AND status = 'active'`,
      [code, type]
    );
  } catch (e) {
    console.warn('[Alertes] autoResolveByType :', e.message);
  }
}

async function getStats() {
  const empty = {
    total: 0, active: 0, resolved: 0, ignored: 0,
    critical: 0, warning: 0, info: 0, by_type: {},
  };
  try {
    const [[counts]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status='active') AS active,
         SUM(status='resolved') AS resolved,
         SUM(status='ignored') AS ignored,
         SUM(severity='critical' AND status='active') AS critical,
         SUM(severity='warning' AND status='active') AS warning,
         SUM(severity='info' AND status='active') AS info
       FROM alerts`
    );
    const [byType] = await pool.query(
      `SELECT type, COUNT(*) AS n FROM alerts WHERE status='active' GROUP BY type`
    );
    const by_type = {};
    byType.forEach((r) => { by_type[r.type] = Number(r.n); });
    return {
      total: Number(counts.total || 0),
      active: Number(counts.active || 0),
      resolved: Number(counts.resolved || 0),
      ignored: Number(counts.ignored || 0),
      critical: Number(counts.critical || 0),
      warning: Number(counts.warning || 0),
      info: Number(counts.info || 0),
      by_type,
    };
  } catch (e) {
    console.warn('[Alertes] getStats :', e.message);
    return empty;
  }
}

/* ---------------------------------------------------------------------------
 * Vérifications automatiques
 * ------------------------------------------------------------------------- */

async function checkOldPositions() {
  let created = 0;
  try {
    const [rows] = await pool.query(
      `SELECT container_code, last_zone, last_camera_id, last_camera_name, last_proof_image_url, last_detected_at
       FROM container_last_positions
       WHERE last_detected_at IS NOT NULL
         AND last_detected_at < (NOW() - INTERVAL ? HOUR)`,
      [THRESHOLDS.STALE_POSITION_HOURS]
    );
    for (const r of rows) {
      const elapsed = formatElapsed(r.last_detected_at);
      const res = await createAlert({
        type: 'OLD_POSITION',
        container_code: r.container_code,
        zone: r.last_zone,
        camera_id: r.last_camera_id,
        camera_name: r.last_camera_name,
        proof_image_url: r.last_proof_image_url,
        source: 'check',
        message: `Dernière position de ${r.container_code} trop ancienne (${elapsed.text}).`,
        details: { last_detected_at: r.last_detected_at, elapsed_seconds: elapsed.seconds },
      });
      if (res?.created) created += 1;
    }
  } catch (e) {
    console.warn('[Alertes] checkOldPositions :', e.message);
  }
  return created;
}

async function checkImmobilizedContainers() {
  let created = 0;
  try {
    const [rows] = await pool.query(
      `SELECT container_code, last_zone, last_camera_id, last_camera_name, last_proof_image_url
       FROM container_last_positions WHERE last_zone IS NOT NULL`
    );
    for (const r of rows) {
      // Début de la présence continue dans la zone actuelle.
      const [[streak]] = await pool.query(
        `SELECT MIN(detected_at) AS since FROM container_movements
         WHERE container_code = ?
           AND detected_at > COALESCE((
             SELECT MAX(detected_at) FROM container_movements
             WHERE container_code = ? AND (zone <> ? OR zone IS NULL)
           ), '1970-01-01')`,
        [r.container_code, r.container_code, r.last_zone]
      );
      if (!streak || !streak.since) continue;
      const hours = (Date.now() - new Date(streak.since).getTime()) / 3600000;
      if (hours >= THRESHOLDS.IMMOBILIZED_HOURS) {
        const res = await createAlert({
          type: 'IMMOBILIZED_TOO_LONG',
          container_code: r.container_code,
          zone: r.last_zone,
          camera_id: r.last_camera_id,
          camera_name: r.last_camera_name,
          proof_image_url: r.last_proof_image_url,
          source: 'check',
          message: `${r.container_code} immobilisé en ${r.last_zone} depuis ${Math.floor(hours)} h.`,
          details: { since: streak.since, hours: Math.floor(hours) },
        });
        if (res?.created) created += 1;
      }
    }
  } catch (e) {
    console.warn('[Alertes] checkImmobilizedContainers :', e.message);
  }
  return created;
}

async function checkOcrSuspicious() {
  let created = 0;
  try {
    const placeholders = THRESHOLDS.OCR_SUSPICIOUS_QUALITIES.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT container_code, last_zone, last_camera_id, last_camera_name, last_proof_image_url, ocr_quality
       FROM container_last_positions
       WHERE ocr_quality IN (${placeholders})`,
      THRESHOLDS.OCR_SUSPICIOUS_QUALITIES
    );
    for (const r of rows) {
      const res = await createAlert({
        type: 'OCR_SUSPICIOUS',
        container_code: r.container_code,
        zone: r.last_zone,
        camera_id: r.last_camera_id,
        camera_name: r.last_camera_name,
        proof_image_url: r.last_proof_image_url,
        source: 'check',
        message: `Lecture OCR incertaine pour ${r.container_code} (qualité : ${r.ocr_quality}).`,
        details: { ocr_quality: r.ocr_quality },
      });
      if (res?.created) created += 1;
    }
  } catch (e) {
    console.warn('[Alertes] checkOcrSuspicious :', e.message);
  }
  return created;
}

async function checkWrongZones() {
  let created = 0;
  try {
    const [rows] = await pool.query(
      `SELECT p.container_code, p.last_zone, p.last_camera_id, p.last_camera_name,
              p.last_proof_image_url, e.expected_zone
       FROM container_last_positions p
       JOIN expected_container_zones e
         ON e.container_code = p.container_code AND e.active = 1
       WHERE p.last_zone IS NOT NULL
         AND p.last_zone <> e.expected_zone`
    );
    for (const r of rows) {
      const res = await createAlert({
        type: 'WRONG_ZONE',
        container_code: r.container_code,
        zone: r.last_zone,
        camera_id: r.last_camera_id,
        camera_name: r.last_camera_name,
        proof_image_url: r.last_proof_image_url,
        source: 'check',
        message: `${r.container_code} détecté en ${r.last_zone} au lieu de ${r.expected_zone}.`,
        details: { expected_zone: r.expected_zone, actual_zone: r.last_zone },
      });
      if (res?.created) created += 1;
    }
  } catch (e) {
    console.warn('[Alertes] checkWrongZones :', e.message);
  }
  return created;
}

async function checkWatchedContainers() {
  let created = 0;
  try {
    const [rows] = await pool.query(
      `SELECT w.container_code, w.reason, p.last_zone, p.last_camera_id,
              p.last_camera_name, p.last_proof_image_url, p.last_detected_at
       FROM watched_containers w
       JOIN container_last_positions p ON p.container_code = w.container_code
       WHERE w.active = 1 AND p.last_detected_at IS NOT NULL`
    );
    for (const r of rows) {
      const res = await createAlert({
        type: 'WATCHED_CONTAINER_DETECTED',
        container_code: r.container_code,
        zone: r.last_zone,
        camera_id: r.last_camera_id,
        camera_name: r.last_camera_name,
        proof_image_url: r.last_proof_image_url,
        source: 'check',
        message: `Conteneur surveillé ${r.container_code} détecté en ${r.last_zone || 'zone inconnue'}.`,
        details: { reason: r.reason, last_detected_at: r.last_detected_at },
      });
      if (res?.created) created += 1;
    }
  } catch (e) {
    console.warn('[Alertes] checkWatchedContainers :', e.message);
  }
  return created;
}

async function checkCameraInactive() {
  let created = 0;
  try {
    const { data } = await axios.get(`${AI_SERVICE_URL}/cameras/`, { timeout: 10000 });
    const cameras = data.cameras || [];
    for (const c of cameras) {
      const id = c.id || c.camera_id;
      const status = c.status || 'active';
      const frameCount = c.frame_count ?? c.frames ?? null;
      const inactive = status !== 'active' || frameCount === 0;
      if (inactive) {
        const res = await createAlert({
          type: 'CAMERA_INACTIVE',
          camera_id: id,
          camera_name: c.name || id,
          zone: c.zone || null,
          source: 'check',
          message: `Caméra ${id} inactive ou sans frames.`,
          details: { status, frame_count: frameCount },
        });
        if (res?.created) created += 1;
      } else {
        // Caméra redevenue active : on résout l'alerte éventuelle.
        await pool.query(
          `UPDATE alerts SET status='resolved', resolved_at=NOW(), resolved_by='system'
           WHERE type='CAMERA_INACTIVE' AND camera_id=? AND status='active'`,
          [id]
        );
      }
    }
  } catch (e) {
    // Le service IA est injoignable -> alerte AI_SERVICE_ERROR.
    await reportAiError('cameras', e);
  }
  return created;
}

async function checkAiServiceError() {
  try {
    await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 8000 });
    // Service OK : on résout les alertes AI actives.
    await pool.query(
      `UPDATE alerts SET status='resolved', resolved_at=NOW(), resolved_by='system'
       WHERE type='AI_SERVICE_ERROR' AND status='active'`
    );
    return 0;
  } catch (e) {
    const res = await reportAiError('health', e);
    return res?.created ? 1 : 0;
  }
}

async function reportAiError(context, err) {
  return createAlert({
    type: 'AI_SERVICE_ERROR',
    source: context,
    message: `Service IA indisponible ou en erreur (${context}) : ${err?.message || 'inconnu'}.`,
    details: { context, error: err?.message || String(err) },
  });
}

/**
 * Évaluation à chaud, après chaque détection / mise à jour de position.
 * Génère OCR_SUSPICIOUS / WATCHED / WRONG_ZONE, et résout OLD_POSITION (position fraîche).
 */
async function evaluateContainerAlerts(payload) {
  const code = normalizeCode(payload.container_code);
  if (!code) return;

  try {
    // Position fraîche -> on résout une éventuelle alerte OLD_POSITION.
    await autoResolveByType(code, 'OLD_POSITION');

    // OCR incertain ou code partiellement lisible ? (Phase 5)
    const suspiciousQuality =
      payload.ocr_quality && THRESHOLDS.OCR_SUSPICIOUS_QUALITIES.includes(payload.ocr_quality);
    if (suspiciousQuality || payload.partial_code_detected) {
      await createAlert({
        type: 'OCR_SUSPICIOUS',
        container_code: code,
        zone: payload.zone,
        camera_id: payload.camera_id,
        camera_name: payload.camera_name,
        proof_image_url: payload.proof_image_url,
        source: payload.source || 'detection',
        message: payload.partial_code_detected
          ? `Code partiellement lisible pour ${code} (qualité OCR : ${payload.ocr_quality || 'à vérifier'}).`
          : `Lecture OCR incertaine pour ${code} (qualité : ${payload.ocr_quality}).`,
        details: {
          ocr_quality: payload.ocr_quality || null,
          partial_code_detected: Boolean(payload.partial_code_detected),
          matched_code: payload.matched_code || null,
          match_score: payload.match_score ?? null,
          raw_ocr_text: payload.raw_ocr_text || null,
        },
      });
    }

    // Conteneur surveillé ?
    const [watched] = await pool.query(
      `SELECT reason FROM watched_containers WHERE container_code = ? AND active = 1 LIMIT 1`,
      [code]
    );
    if (watched[0]) {
      await createAlert({
        type: 'WATCHED_CONTAINER_DETECTED',
        container_code: code,
        zone: payload.zone,
        camera_id: payload.camera_id,
        camera_name: payload.camera_name,
        proof_image_url: payload.proof_image_url,
        source: payload.source || 'detection',
        message: `Conteneur surveillé ${code} détecté en ${payload.zone || 'zone inconnue'}.`,
        details: { reason: watched[0].reason },
      });
    }

    // Mauvaise zone ?
    if (payload.zone) {
      const [expected] = await pool.query(
        `SELECT expected_zone FROM expected_container_zones WHERE container_code = ? AND active = 1 LIMIT 1`,
        [code]
      );
      if (expected[0] && expected[0].expected_zone !== payload.zone) {
        await createAlert({
          type: 'WRONG_ZONE',
          container_code: code,
          zone: payload.zone,
          camera_id: payload.camera_id,
          camera_name: payload.camera_name,
          proof_image_url: payload.proof_image_url,
          source: payload.source || 'detection',
          message: `${code} détecté en ${payload.zone} au lieu de ${expected[0].expected_zone}.`,
          details: { expected_zone: expected[0].expected_zone, actual_zone: payload.zone },
        });
      } else if (expected[0]) {
        await autoResolveByType(code, 'WRONG_ZONE');
      }
    }
  } catch (e) {
    console.warn('[Alertes] evaluateContainerAlerts :', e.message);
  }
}

/**
 * Phase 5 : déclenche une alerte OCR_SUSPICIOUS depuis une lecture OCR douteuse
 * (qualité faible/à vérifier ou code partiel), y compris hors détection confirmée
 * (recherche non trouvée, upload d'image, scan caméra).
 * @returns {Promise<object|null>}
 */
async function reportOcrQuality(payload = {}) {
  const quality = payload.ocr_quality || null;
  const partial = Boolean(payload.partial_code_detected);
  const suspicious = quality && THRESHOLDS.OCR_SUSPICIOUS_QUALITIES.includes(quality);
  if (!suspicious && !partial) return null;

  const code = payload.container_code
    ? normalizeCode(payload.container_code)
    : payload.matched_code
      ? normalizeCode(payload.matched_code)
      : null;

  try {
    return await createAlert({
      type: 'OCR_SUSPICIOUS',
      container_code: code,
      zone: payload.zone || null,
      camera_id: payload.camera_id || null,
      camera_name: payload.camera_name || null,
      proof_image_url: payload.proof_image_url || null,
      source: payload.source || 'ocr',
      message: partial
        ? `Code partiellement lisible${code ? ` (${code})` : ''} — qualité OCR : ${quality || 'à vérifier'}.`
        : `Lecture OCR incertaine${code ? ` pour ${code}` : ''} (qualité : ${quality}).`,
      details: {
        ocr_quality: quality,
        partial_code_detected: partial,
        matched_code: payload.matched_code || null,
        match_score: payload.match_score ?? null,
        raw_ocr_text: payload.raw_ocr_text || null,
        source_context: payload.source_context || null,
      },
    });
  } catch (e) {
    console.warn('[Alertes] reportOcrQuality :', e.message);
    return null;
  }
}

async function runAllChecks() {
  const summary = {
    old_position: await checkOldPositions(),
    immobilized: await checkImmobilizedContainers(),
    ocr_suspicious: await checkOcrSuspicious(),
    wrong_zone: await checkWrongZones(),
    watched: await checkWatchedContainers(),
    camera_inactive: await checkCameraInactive(),
    ai_service_error: await checkAiServiceError(),
  };
  summary.total_created = Object.values(summary).reduce((a, b) => a + (Number(b) || 0), 0);
  return summary;
}

module.exports = {
  createAlert,
  getAlerts,
  getAlertById,
  getActiveAlertsForContainer,
  resolveAlert,
  ignoreAlert,
  autoResolveByType,
  getStats,
  checkOldPositions,
  checkImmobilizedContainers,
  checkOcrSuspicious,
  checkWrongZones,
  checkWatchedContainers,
  checkCameraInactive,
  checkAiServiceError,
  reportAiError,
  reportOcrQuality,
  evaluateContainerAlerts,
  runAllChecks,
};
