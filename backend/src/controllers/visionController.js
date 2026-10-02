const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const { query } = require('../config/database');
const { createJob, getJob, runVisionJob } = require('../services/visionJobService');
const { mapDetectionMode } = require('../utils/detectionLabels');
const { persistVisionImage, getUploadsRoot } = require('../services/visionStorageService');
const { resolveCameraFromLocation } = require('../utils/zoneCameraMap');
const { recordDetection } = require('../services/containerTrackingService');

/**
 * Qualité OCR lisible à partir de la confiance moyenne (0–1).
 */
function qualifyOcr(avgConfidence) {
  if (avgConfidence == null) return 'à vérifier';
  const c = Number(avgConfidence);
  if (c >= 0.75) return 'bon';
  if (c >= 0.5) return 'moyen';
  if (c >= 0.3) return 'faible';
  return 'à vérifier';
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

function pickPrimaryCode(normalized, matchCode) {
  if (matchCode && String(matchCode).trim()) return String(matchCode).trim();
  const codes = normalized.extracted_codes || [];
  if (codes.length > 0) return codes[0].normalized_code;
  return null;
}

async function uploadSync(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Fichier image requis (champ file).' });
    }

    const mode = (req.body.mode || 'ocr_only').trim();
    const matchCode = req.body.match_code ? String(req.body.match_code).trim() : '';
    const locationLabel = (req.body.location || req.body.zone || '').trim();
    const cameraIdInput = (req.body.camera_id || '').trim();
    const useYolo = mode === 'yolo_ocr';
    const camResolved = resolveCameraFromLocation(cameraIdInput || locationLabel);

    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    if (matchCode) {
      form.append('container_code', matchCode);
    }
    form.append('mode', useYolo ? 'yolo_ocr' : 'ocr_only');

    const { data } = await axios.post(`${AI_SERVICE_URL}/experimental/detect-image`, form, {
      headers: form.getHeaders(),
      maxBodyLength: 40 * 1024 * 1024,
      maxContentLength: 40 * 1024 * 1024,
      timeout: 300000,
    });

    const ocrLines = data.ocr_on_full_image || data.ocr_detections || [];
    const normalized = {
      ...data,
      pipeline_mode: data.pipeline_mode || (useYolo ? 'yolo_ocr' : 'ocr_only'),
      match_found: data.match_found,
      match_requested: Boolean(matchCode),
      ocr_avg_confidence:
        ocrLines.length > 0
          ? ocrLines.reduce((s, r) => s + (r.confidence || 0), 0) / ocrLines.length
          : null,
      extracted_codes: data.extracted_codes || [],
      sample_ocr_lines: ocrLines.slice(0, 20),
      yolo_warning:
        useYolo && data.yolo_detection_count === 0
          ? 'YOLO exécuté, aucune détection exploitable. OCR utilisé sur l\'image complète.'
          : null,
    };

    const { decidePresence } = require('../services/visionAnalyzeService');
    const presence = decidePresence(data);
    if (!presence.containerDetected) {
      return res.json({
        success: true,
        containerDetected: false,
        code: null,
        data: {
          ...normalized,
          containerDetected: false,
          storage: { stored: false },
        },
      });
    }

    const stored = persistVisionImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    const adminId = req.admin?.id || null;
    const primaryCode = pickPrimaryCode(normalized, matchCode);
    const searched = primaryCode || 'IMAGE_UPLOAD';
    const detected =
      Boolean(normalized.match_found) ||
      (normalized.extracted_codes && normalized.extracted_codes.length > 0);
    const zone = camResolved.zone;
    const cameraName = camResolved.camera_name;
    const detectionMode = mapDetectionMode(null, useYolo ? 'yolo_ocr' : 'ocr_only');
    const yoloUsed = Boolean(
      normalized.yolo_detection_count > 0 ||
      (normalized.yolo_detections && normalized.yolo_detections.length > 0)
    );

    const storagePayload = {
      stored_image_url: stored.public_url,
      stored_filename: stored.filename,
      original_filename: req.file.originalname,
      zone,
      camera_id: camResolved.camera_id,
      location_label: locationLabel || null,
      primary_ocr_code: primaryCode,
      extracted_codes: normalized.extracted_codes,
      pipeline_mode: normalized.pipeline_mode,
      ocr_avg_confidence: normalized.ocr_avg_confidence,
      yolo_detection_count: normalized.yolo_detection_count ?? 0,
      yolo_detections: normalized.yolo_detections || [],
      match_found: normalized.match_found,
      matched_text: normalized.matched_text || null,
      sample_ocr_lines: normalized.sample_ocr_lines,
      warnings: normalized.warnings || [],
      processing_time_ms: normalized.processing_time_ms,
    };

    let detectionId = null;
    let historyId = null;
    let visionUploadId = null;

    try {
      if (primaryCode) {
        const det = await query(
          `INSERT INTO detections (
             container_code, detected, camera_name, zone, confidence, image_path, detected_at,
             global_confidence, yolo_confidence, yolo_detected, annotated_path
           ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, NULL, ?, ?)`,
          [
            primaryCode,
            detected ? 1 : 0,
            cameraName,
            zone,
            normalized.ocr_avg_confidence != null ? Number(normalized.ocr_avg_confidence) : 0,
            stored.evidence_path,
            normalized.ocr_avg_confidence != null ? Number(normalized.ocr_avg_confidence) : null,
            yoloUsed ? 1 : 0,
            stored.evidence_path,
          ]
        );
        detectionId = det.insertId;
      }

      const hist = await query(
        `INSERT INTO search_history (
           searched_code, result, detection_id, admin_id, source, global_confidence, evidence_path,
           detection_mode, source_match, camera_name, zone, confidence, analysis_json
         ) VALUES (?, ?, ?, ?, 'upload', ?, ?, ?, 'ocr', ?, ?, ?, ?)`,
        [
          searched,
          detected ? 'detected' : 'not_detected',
          detectionId,
          adminId,
          normalized.ocr_avg_confidence != null ? Number(normalized.ocr_avg_confidence) : null,
          stored.evidence_path,
          detectionMode,
          cameraName,
          zone,
          normalized.ocr_avg_confidence != null ? Number(normalized.ocr_avg_confidence) : null,
          JSON.stringify(storagePayload),
        ]
      );
      historyId = hist.insertId;

      const vu = await query(
        `INSERT INTO vision_uploads (
           admin_id, search_history_id, detection_id, stored_filename, evidence_path,
           original_filename, zone, location_label, match_code, primary_ocr_code,
           pipeline_mode, ocr_avg_confidence, yolo_detection_count, yolo_detected, match_found,
           analysis_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adminId,
          historyId,
          detectionId,
          stored.filename,
          stored.evidence_path,
          req.file.originalname || null,
          zone,
          locationLabel || null,
          matchCode || null,
          primaryCode,
          normalized.pipeline_mode,
          normalized.ocr_avg_confidence != null ? Number(normalized.ocr_avg_confidence) : null,
          normalized.yolo_detection_count ?? 0,
          yoloUsed ? 1 : 0,
          normalized.match_found ? 1 : 0,
          JSON.stringify({ ...storagePayload, ai_raw: data }),
        ]
      );
      visionUploadId = vu.insertId;
    } catch (dbErr) {
      console.warn('[Vision][DB] Enregistrement stockage :', dbErr.message);
    }

    // --- Phase 1 : suivi position + historique déplacements (upload) ---
    // Phase 5 : on privilégie la qualité OCR renvoyée par l'IA, sinon repli local.
    const uploadOcrQuality = data.ocr_quality || qualifyOcr(normalized.ocr_avg_confidence);
    const uploadPartial = Boolean(data.partial_code_detected);
    if (primaryCode) {
      try {
        await recordDetection({
          containerCode: primaryCode,
          cameraId: camResolved.camera_id !== 'UPLOAD' ? camResolved.camera_id : null,
          cameraName,
          zone,
          confidence: normalized.ocr_avg_confidence,
          proofImagePath: stored.evidence_path,
          proofImageUrl: stored.public_url || stored.evidence_path,
          detectedAt: new Date(),
          source: 'upload',
          detectionMode,
          orientation: data.orientation || null,
          ocrQuality: uploadOcrQuality,
          partialCodeDetected: uploadPartial,
          matchedCode: data.matched_code || null,
          matchScore: data.match_score ?? null,
          rawOcrText: data.raw_ocr_text || null,
        });
      } catch (tErr) {
        console.warn('[Tracking] upload :', tErr.message);
      }
    }

    // Phase 5 : alerte OCR_SUSPICIOUS si qualité douteuse ou code partiel (upload).
    try {
      const { reportOcrQuality } = require('../services/alertService');
      await reportOcrQuality({
        container_code: primaryCode || data.matched_code || null,
        zone,
        camera_id: camResolved.camera_id !== 'UPLOAD' ? camResolved.camera_id : null,
        camera_name: cameraName,
        proof_image_url: stored.public_url || stored.evidence_path,
        ocr_quality: uploadOcrQuality,
        partial_code_detected: uploadPartial,
        matched_code: data.matched_code || null,
        match_score: data.match_score ?? null,
        raw_ocr_text: data.raw_ocr_text || null,
        source: 'upload',
        source_context: 'image_upload',
      });
    } catch (oErr) {
      console.warn('[Vision][OCR alert]', oErr.message);
    }

    // Phase 6 : audit de l'upload + analyse OCR.
    try {
      const audit = require('../services/auditService');
      await audit.logSuccess({
        admin: req.admin,
        req,
        action: 'upload.image',
        resource_type: 'vision_upload',
        resource_id: visionUploadId || detectionId || null,
        details: { detected: !!data.detected, ocr_quality: data.ocr_quality || null },
      });
    } catch (_) { /* audit best effort */ }

    return res.json({
      success: true,
      data: {
        ...normalized,
        storage: {
          ...storagePayload,
          history_id: historyId,
          vision_upload_id: visionUploadId,
          detection_id: detectionId,
          stored: true,
        },
      },
    });
  } catch (err) {
    console.error('[Vision] uploadSync :', err.message);
    try {
      const { reportAiError } = require('../services/alertService');
      await reportAiError('vision_upload', err);
    } catch { /* non-bloquant */ }
    let detail = err.response?.data?.detail || err.message;
    const raw = String(detail || err.message || '');
    if (raw.includes('socket hang up') || raw.includes('ECONNRESET') || raw.includes('ECONNABORTED')) {
      detail =
        'Le service IA s\'est interrompu pendant l\'analyse (souvent mémoire insuffisante ou image très lourde). ' +
        'Réessayez en mode « OCR seul », attendez 30 s après un scan caméra, ou utilisez une image plus petite.';
    }
    return res.status(err.response?.status || 502).json({
      success: false,
      error: typeof detail === 'string' ? detail : JSON.stringify(detail),
    });
  }
}

async function uploadAsync(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Fichier image requis (champ file).' });
    }

    const jobId = createJob();
    const { buffer, originalname, mimetype } = req.file;
    const matchCode = req.body.match_code;

    setImmediate(() => {
      runVisionJob(jobId, buffer, originalname, mimetype, matchCode ? String(matchCode).trim() : null);
    });

    return res.status(202).json({
      success: true,
      jobId,
      status: 'pending',
      pollUrl: `/api/vision/jobs/${jobId}`,
    });
  } catch (err) {
    next(err);
  }
}

async function getJobStatus(req, res, next) {
  try {
    const job = getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job introuvable.' });
    }
    return res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function listVisionUploads(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await query(
      `SELECT id, evidence_path, zone, location_label, primary_ocr_code, pipeline_mode,
              ocr_avg_confidence, match_found, created_at
       FROM vision_uploads
       ORDER BY id DESC
       LIMIT ?`,
      [limit]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

const { analyzeWithoutPersist, consumePending } = require('../services/visionAnalyzeService');
const { getCamera } = require('../config/cameraCatalog');
const iso = require('../utils/iso6346');

async function analyzeOnly(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Fichier image requis (champ file).' });
    }
    const cameraId = (req.body.camera_id || '').trim();
    const cam = cameraId ? getCamera(cameraId) : null;
    const camResolved = resolveCameraFromLocation(cameraId || req.body.zone || req.body.location || '');
    const result = await analyzeWithoutPersist(req.file, {
      matchCode: req.body.match_code,
      sourceType: req.body.source_type || 'mobile',
      camera: cam
        ? { id: cam.id, zone: cam.zone, name: cam.name }
        : { id: camResolved.camera_id, zone: camResolved.zone, name: camResolved.camera_name },
    });

    if (!result.containerDetected) {
      try {
        await query(
          `INSERT INTO technical_scan_logs (admin_id, camera_id, zone, reason, source_type, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            req.admin?.id || null,
            result.camera?.id || cameraId || null,
            result.camera?.zone || null,
            result.reason || 'no_container',
            req.body.source_type || 'mobile',
          ]
        );
      } catch (_) { /* table may not exist yet */ }
    }

    return res.json({
      success: true,
      analysisId: result.analysisId,
      containerDetected: result.containerDetected,
      containerConfidence: result.containerConfidence,
      ocrDetected: result.ocrDetected,
      code: result.code,
      ocrConfidence: result.ocrConfidence,
      isoValid: result.isoValid,
      requiresReview: result.requiresReview,
      validationStatus: result.validationStatus,
      boundingBox: result.boundingBox,
      camera: result.camera,
      sourceType: result.sourceType,
      proof: result.proof,
      yoloDetectionCount: result.yoloDetectionCount,
      yoloClasses: result.yoloClasses,
      analyzedAt: result.analyzedAt,
      pipeline: result.pipeline,
    });
  } catch (err) {
    console.error('[Vision] analyzeOnly :', err.message);
    let detail = err.response?.data?.detail || err.message;
    return res.status(err.response?.status || 502).json({
      success: false,
      error: typeof detail === 'string' ? detail : 'Service IA indisponible.',
    });
  }
}

async function persistDetection(req, res) {
  try {
    const analysisId = req.body.analysisId || req.body.analysis_id;
    const pending = consumePending(analysisId);
    if (!pending) {
      return res.status(404).json({ success: false, error: 'Analyse expirée. Reprenez la photo.' });
    }
    if (!pending.mapped.containerDetected) {
      return res.status(400).json({
        success: false,
        error: 'Aucun conteneur détecté : rien n’est enregistré en base métier.',
      });
    }

    const action = req.body.action || 'save';
    if (action === 'reject' || action === 'false_positive') {
      return res.json({ success: true, saved: false, validationStatus: 'rejected' });
    }

    let code = req.body.code ? iso.normalizeCode(req.body.code) : pending.mapped.code;
    if (code) code = iso.cautiousOcrFix(code);
    const isoValid = iso.isoValid(code);
    const manually = Boolean(req.body.code && req.body.code !== pending.mapped.code);
    const validationStatus = action === 'reject'
      ? 'rejected'
      : manually
        ? 'manually_validated'
        : pending.mapped.validationStatus;

    const stored = persistVisionImage(
      pending.file.buffer,
      pending.file.originalname,
      pending.file.mimetype
    );
    const cam = pending.mapped.camera || {};
    const cameraName = cam.id && cam.id !== 'UPLOAD' ? cam.id : 'MOBILE';
    const zone = cam.zone || 'Contrôle mobile';
    const conf = pending.mapped.ocrConfidence ?? pending.mapped.containerConfidence ?? 0;
    const adminId = req.admin?.id || null;
    const detectionMode = mapDetectionMode(null, 'yolo_ocr');

    const det = await query(
      `INSERT INTO detections (
         container_code, detected, camera_name, zone, confidence, image_path, detected_at,
         global_confidence, yolo_confidence, yolo_detected, annotated_path
       ) VALUES (?, 1, ?, ?, ?, ?, NOW(), ?, ?, 1, ?)`,
      [
        code || 'UNREADABLE',
        cameraName,
        zone,
        conf,
        stored.evidence_path,
        conf,
        pending.mapped.containerConfidence || null,
        stored.evidence_path,
      ]
    );

    if (code && iso.isIsoFormat(code)) {
      const last = await query(
        `SELECT container_code, camera_name, detected_at FROM detections
         WHERE container_code = ? AND camera_name = ?
         ORDER BY id DESC LIMIT 1 OFFSET 1`,
        [code, cameraName]
      );
      const prev = last[0];
      const tooSoon = prev && Date.now() - new Date(prev.detected_at).getTime() < 90_000;
      if (!tooSoon) {
        await recordDetection({
          containerCode: code,
          cameraId: cameraName !== 'MOBILE' && cameraName !== 'UPLOAD' ? cameraName : null,
          cameraName,
          zone,
          confidence: conf,
          proofImagePath: stored.evidence_path,
          proofImageUrl: stored.public_url,
          detectedAt: new Date(),
          source: req.body.source_type || 'mobile-camera-control',
          detectionMode,
          ocrQuality: isoValid ? 'bon' : 'à vérifier',
          partialCodeDetected: !isoValid,
        });
      }
    }

    if (req.body.session_id) {
      try {
        await query(
          `UPDATE camera_inspection_sessions SET scans_count = scans_count + 1 WHERE id = ?`,
          [req.body.session_id]
        );
      } catch (_) { /* optional */ }
    }

    return res.json({
      success: true,
      saved: true,
      detectionId: det.insertId,
      validationStatus,
      proof: { original: stored.public_url, annotated: stored.public_url },
      code,
      isoValid,
    });
  } catch (err) {
    console.error('[Vision] persistDetection :', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function listReviewQueue(req, res) {
  try {
    const rows = await query(
      `SELECT id, container_code, camera_name, zone, confidence, image_path, detected_at, global_confidence
       FROM detections
       WHERE detected = 1 AND (confidence < 0.75 OR container_code = 'UNREADABLE' OR container_code IS NULL)
       ORDER BY id DESC LIMIT 50`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  uploadSync,
  uploadAsync,
  getJobStatus,
  listVisionUploads,
  getUploadsRoot,
  analyzeOnly,
  persistDetection,
  listReviewQueue,
};
