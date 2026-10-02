/**
 * Recherche locale dans detections + vision_uploads (uploads manuels, scans précédents).
 */
const { pool } = require('../config/database');
const { resolveCameraFromLocation } = require('../utils/zoneCameraMap');

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .replace(/[\s\-\.]+/g, '')
    .toUpperCase();
}

function resolveCamera(cameraName, zone, locationLabel) {
  if (cameraName && cameraName !== 'UPLOAD') return cameraName;
  const resolved = resolveCameraFromLocation(locationLabel || zone);
  return resolved.camera_name !== 'UPLOAD' ? resolved.camera_name : null;
}

function resolveZone(zone, locationLabel) {
  const resolved = resolveCameraFromLocation(locationLabel || zone);
  return resolved.zone || zone || null;
}

function formatDetectionRow(row, searchedCode) {
  const evidence = row.annotated_path || row.image_path || null;
  const camera = resolveCamera(row.camera_name, row.zone, null);
  const zone = resolveZone(row.zone, null) || row.zone;
  return {
    searched_code: searchedCode,
    detected: true,
    container_code: row.container_code,
    camera_name: camera,
    zone,
    confidence: Number(row.confidence || row.global_confidence || 0),
    global_confidence: row.global_confidence != null ? Number(row.global_confidence) : null,
    image_path: evidence,
    evidence_image_url: evidence,
    annotated_image_url: row.annotated_path || null,
    detected_at: row.detected_at,
    yolo_detected: Boolean(row.yolo_detected),
    source_match: 'stored_registry',
    pipeline_mode: null,
    ocr_used: true,
    message: 'Conteneur retrouvé dans l\'historique des détections enregistrées.',
  };
}

function formatUploadRow(row, searchedCode) {
  const camera = resolveCamera('UPLOAD', row.zone, row.location_label);
  const zone = resolveZone(row.zone, row.location_label);
  return {
    searched_code: searchedCode,
    detected: true,
    container_code: row.primary_ocr_code,
    camera_name: camera,
    zone,
    confidence: Number(row.ocr_avg_confidence || 0),
    global_confidence: row.ocr_avg_confidence != null ? Number(row.ocr_avg_confidence) : null,
    image_path: row.evidence_path,
    evidence_image_url: row.evidence_path,
    annotated_image_url: null,
    detected_at: row.created_at,
    yolo_detected: String(row.pipeline_mode || '').includes('yolo'),
    source_match: 'upload',
    pipeline_mode: row.pipeline_mode || null,
    ocr_used: true,
    message: 'Conteneur retrouvé via une analyse image enregistrée.',
  };
}

/**
 * @param {string} containerCode
 * @returns {Promise<object|null>} Payload aligné sur la réponse IA /detect
 */
async function findStoredContainer(containerCode) {
  const norm = normalizeCode(containerCode);
  if (norm.length < 3) return null;

  const [exactDets] = await pool.query(
    `SELECT container_code, camera_name, zone, confidence, global_confidence,
            image_path, annotated_path, detected_at, yolo_detected
     FROM detections
     WHERE detected = 1
       AND REPLACE(UPPER(container_code), ' ', '') = ?
     ORDER BY id DESC
     LIMIT 1`,
    [norm]
  );

  const [exactUploads] = await pool.query(
    `SELECT primary_ocr_code, zone, location_label, evidence_path,
            ocr_avg_confidence, created_at, pipeline_mode
     FROM vision_uploads
     WHERE REPLACE(UPPER(primary_ocr_code), ' ', '') = ?
     ORDER BY id DESC
     LIMIT 1`,
    [norm]
  );

  let hit = null;
  if (exactDets[0]) {
    hit = { kind: 'detection', row: exactDets[0], at: exactDets[0].detected_at };
  }
  if (exactUploads[0]) {
    const at = exactUploads[0].created_at;
    if (!hit || new Date(at) > new Date(hit.at || 0)) {
      hit = { kind: 'upload', row: exactUploads[0], at };
    }
  }

  if (!hit && /^\d{4,}$/.test(norm)) {
    const [partialDets] = await pool.query(
      `SELECT container_code, camera_name, zone, confidence, global_confidence,
              image_path, annotated_path, detected_at, yolo_detected
       FROM detections
       WHERE detected = 1 AND REPLACE(UPPER(container_code), ' ', '') LIKE ?
       ORDER BY id DESC
       LIMIT 1`,
      [`%${norm}%`]
    );
    const [partialUploads] = await pool.query(
      `SELECT primary_ocr_code, zone, location_label, evidence_path,
              ocr_avg_confidence, created_at, pipeline_mode
       FROM vision_uploads
       WHERE REPLACE(UPPER(primary_ocr_code), ' ', '') LIKE ?
       ORDER BY id DESC
       LIMIT 1`,
      [`%${norm}%`]
    );
    if (partialDets[0]) {
      hit = { kind: 'detection', row: partialDets[0], at: partialDets[0].detected_at };
    }
    if (partialUploads[0]) {
      const at = partialUploads[0].created_at;
      if (!hit || new Date(at) > new Date(hit.at || 0)) {
        hit = { kind: 'upload', row: partialUploads[0], at };
      }
    }
  }

  if (!hit) return null;

  if (hit.kind === 'upload') {
    return formatUploadRow(hit.row, norm);
  }
  return formatDetectionRow(hit.row, norm);
}

module.exports = { findStoredContainer, normalizeCode };
