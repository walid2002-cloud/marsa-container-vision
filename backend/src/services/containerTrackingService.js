/**
 * Suivi de la dernière position connue + historique des déplacements (Phase 1).
 *
 * À chaque détection (recherche, upload, scan caméra, intégration), on :
 *   1. insère une ligne dans container_movements (timeline)
 *   2. met à jour container_last_positions (upsert) si la détection est plus récente
 */
const { pool } = require('../config/database');
const { resolvePublicProofUrl } = require('./proofUrlService');
const { formatElapsed } = require('../utils/timeElapsed');

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .replace(/[\s\-.]+/g, '')
    .toUpperCase();
}

function toMysqlDateTime(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Enregistre un mouvement + met à jour la dernière position.
 * @param {object} p
 * @returns {Promise<{movementId:number|null}>}
 */
async function recordDetection(p) {
  const code = normalizeCode(p.containerCode);
  if (!code || code.length < 3) return { movementId: null };

  const cameraId = p.cameraId || null;
  const cameraName = p.cameraName || null;
  const zone = p.zone || null;
  const confidence = p.confidence != null ? Number(p.confidence) : null;
  const proofPath = p.proofImagePath || null;
  const proofUrl = p.proofImageUrl || (proofPath ? resolvePublicProofUrl(proofPath) : null);
  const detectedAt = toMysqlDateTime(p.detectedAt);
  const source = p.source || 'manual';
  const detectionMode = p.detectionMode || null;
  const orientation = p.orientation || null;
  const ocrQuality = p.ocrQuality || null;
  const partialCodeDetected = Boolean(p.partialCodeDetected);
  const matchedCode = p.matchedCode || null;
  const matchScore = p.matchScore ?? null;
  const rawOcrText = p.rawOcrText || null;

  // Déduplication : ne pas ré-enregistrer une détection identique (même code,
  // même caméra, même horodatage) déjà présente en tête de l'historique.
  try {
    const [dup] = await pool.query(
      `SELECT id FROM container_movements
       WHERE container_code = ? AND detected_at = ?
         AND ((camera_name IS NULL AND ? IS NULL) OR camera_name = ?)
       ORDER BY id DESC LIMIT 1`,
      [code, detectedAt, cameraName, cameraName]
    );
    if (dup[0]) {
      return { movementId: dup[0].id, deduped: true };
    }
  } catch (e) {
    console.warn('[Tracking] dedup check :', e.message);
  }

  let movementId = null;
  try {
    const [ins] = await pool.query(
      `INSERT INTO container_movements (
         container_code, camera_id, camera_name, zone, confidence,
         proof_image_path, proof_image_url, detected_at, source,
         detection_mode, orientation, ocr_quality
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code, cameraId, cameraName, zone, confidence,
        proofPath, proofUrl, detectedAt, source,
        detectionMode, orientation, ocrQuality,
      ]
    );
    movementId = ins.insertId;
  } catch (e) {
    console.warn('[Tracking] insert movement :', e.message);
    return { movementId: null };
  }

  try {
    await pool.query(
      `INSERT INTO container_last_positions (
         container_code, last_camera_id, last_camera_name, last_zone, last_confidence,
         last_proof_image_url, last_detected_at, detection_mode, orientation, ocr_quality, movements_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         last_camera_id     = IF(VALUES(last_detected_at) >= last_detected_at OR last_detected_at IS NULL, VALUES(last_camera_id), last_camera_id),
         last_camera_name   = IF(VALUES(last_detected_at) >= last_detected_at OR last_detected_at IS NULL, VALUES(last_camera_name), last_camera_name),
         last_zone          = IF(VALUES(last_detected_at) >= last_detected_at OR last_detected_at IS NULL, VALUES(last_zone), last_zone),
         last_confidence    = IF(VALUES(last_detected_at) >= last_detected_at OR last_detected_at IS NULL, VALUES(last_confidence), last_confidence),
         last_proof_image_url = IF(VALUES(last_detected_at) >= last_detected_at OR last_detected_at IS NULL, VALUES(last_proof_image_url), last_proof_image_url),
         detection_mode     = IF(VALUES(last_detected_at) >= last_detected_at OR last_detected_at IS NULL, VALUES(detection_mode), detection_mode),
         orientation        = IF(VALUES(last_detected_at) >= last_detected_at OR last_detected_at IS NULL, VALUES(orientation), orientation),
         ocr_quality        = IF(VALUES(last_detected_at) >= last_detected_at OR last_detected_at IS NULL, VALUES(ocr_quality), ocr_quality),
         last_detected_at   = GREATEST(COALESCE(last_detected_at, VALUES(last_detected_at)), VALUES(last_detected_at)),
         movements_count    = movements_count + 1`,
      [
        code, cameraId, cameraName, zone, confidence,
        proofUrl, detectedAt, detectionMode, orientation, ocrQuality,
      ]
    );
  } catch (e) {
    console.warn('[Tracking] upsert last position :', e.message);
  }

  // Phase 7 : enregistrement de la preuve visuelle centralisée (best-effort).
  if (proofPath || proofUrl) {
    try {
      const visualProofService = require('./visualProofService');
      await visualProofService.recordProof({
        container_code: code,
        image_path: proofPath,
        image_url: proofUrl,
        source,
        camera_id: cameraId,
        zone,
        captured_at: detectedAt,
      });
    } catch (e) {
      console.warn('[Proofs] record from tracking :', e.message);
    }
  }

  // Phase 3 : évaluation des alertes après mise à jour de la position (require paresseux).
  try {
    const { evaluateContainerAlerts } = require('./alertService');
    await evaluateContainerAlerts({
      container_code: code,
      zone,
      camera_id: cameraId,
      camera_name: cameraName,
      proof_image_url: proofUrl,
      ocr_quality: ocrQuality,
      partial_code_detected: partialCodeDetected,
      matched_code: matchedCode,
      match_score: matchScore,
      raw_ocr_text: rawOcrText,
      source,
    });
  } catch (e) {
    console.warn('[Tracking] evaluateContainerAlerts :', e.message);
  }

  return { movementId };
}

/**
 * Renvoie la dernière position connue enrichie (temps écoulé, badge à vérifier).
 * @returns {Promise<object|null>}
 */
async function getLastPosition(containerCode) {
  const code = normalizeCode(containerCode);
  if (!code) return null;
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT * FROM container_last_positions WHERE container_code = ? LIMIT 1`,
      [code]
    );
  } catch (e) {
    console.warn('[Tracking] getLastPosition :', e.message);
    return null;
  }
  const row = rows[0];
  if (!row) return null;

  const elapsed = formatElapsed(row.last_detected_at);
  return {
    container_code: row.container_code,
    last_camera_id: row.last_camera_id,
    last_camera_name: row.last_camera_name,
    last_zone: row.last_zone,
    last_confidence: row.last_confidence != null ? Number(row.last_confidence) : null,
    last_proof_image_url: row.last_proof_image_url,
    last_detected_at: row.last_detected_at,
    detection_mode: row.detection_mode,
    orientation: row.orientation,
    ocr_quality: row.ocr_quality,
    movements_count: row.movements_count,
    elapsed_since_last_detection: elapsed.text,
    elapsed_seconds: elapsed.seconds,
    needs_verification: elapsed.needs_verification,
  };
}

/**
 * Timeline des déplacements (du plus récent au plus ancien).
 * @returns {Promise<Array>}
 */
async function getMovements(containerCode, limit = 20) {
  const code = normalizeCode(containerCode);
  if (!code) return [];
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT id, container_code, camera_id, camera_name, zone, confidence,
              proof_image_path, proof_image_url, detected_at, source, detection_mode,
              orientation, ocr_quality
       FROM container_movements
       WHERE container_code = ?
       ORDER BY detected_at DESC, id DESC
       LIMIT ?`,
      [code, lim]
    );
  } catch (e) {
    console.warn('[Tracking] getMovements :', e.message);
    return [];
  }
  return rows.map((r) => {
    const elapsed = formatElapsed(r.detected_at);
    return {
      ...r,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      proof_image_url: r.proof_image_url || resolvePublicProofUrl(r.proof_image_path),
      elapsed_since_detection: elapsed.text,
      elapsed_seconds: elapsed.seconds,
    };
  });
}

module.exports = { recordDetection, getLastPosition, getMovements, normalizeCode };
