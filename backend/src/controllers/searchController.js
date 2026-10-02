const { query } = require('../config/database');
const { createNotification } = require('../services/notificationService');
const visionClient = require('../services/containerVisionClient');
const { mapDetectionMode } = require('../utils/detectionLabels');
const { recordDetection, getLastPosition, getMovements } = require('../services/containerTrackingService');
const { getActiveAlertsForContainer } = require('../services/alertService');

function buildAiResponse(raw, result) {
  return {
    ...raw,
    detected: result.detected,
    message: result.message,
    camera_name: result.detected ? raw.camera_name : null,
    zone: result.detected ? raw.zone : null,
    confidence: result.detected ? raw.confidence : 0,
    image_path: result.detected ? raw.image_path : null,
    evidence_image_url: result.detected ? raw.evidence_image_url : null,
    annotated_image_url: result.detected ? raw.annotated_image_url : null,
    searched_code: raw.searched_code || result.code,
    source_match: raw.source_match || null,
    detection_mode: mapDetectionMode(raw.source_match, raw.pipeline_mode),
    images_analyzed: raw.images_analyzed ?? raw.cameras_scanned ?? null,
    cameras_scanned: raw.cameras_scanned ?? raw.images_analyzed ?? null,
  };
}

async function searchContainer(req, res, next) {
  try {
    const { container_code } = req.body;
    const adminId = req.admin?.id || null;

    if (!container_code || container_code.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Le code du conteneur est requis.',
      });
    }

    const code = container_code.trim();

    const result = await visionClient.searchContainer(code);

    if (result.error) {
      try {
        const { reportAiError } = require('../services/alertService');
        await reportAiError('search', new Error(result.message || 'IA indisponible'));
      } catch { /* non-bloquant */ }
      return res.status(502).json({
        success: false,
        error: result.message || 'Le service IA est temporairement indisponible.',
      });
    }

    const raw = result.raw || {};
    const aiResponse = buildAiResponse(raw, result);

    const evidencePath =
      aiResponse.annotated_image_url ||
      aiResponse.evidence_image_url ||
      aiResponse.image_path ||
      null;

    let detectionId = null;
    try {
      const insertDetection = await query(
        `INSERT INTO detections (
           container_code, detected, camera_name, zone, confidence, image_path, detected_at,
           global_confidence, yolo_confidence, yolo_detected, annotated_path
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aiResponse.searched_code,
          aiResponse.detected,
          aiResponse.camera_name,
          aiResponse.zone,
          aiResponse.confidence,
          aiResponse.image_path,
          aiResponse.detected_at,
          aiResponse.global_confidence != null ? Number(aiResponse.global_confidence) : null,
          aiResponse.yolo_confidence != null ? Number(aiResponse.yolo_confidence) : null,
          aiResponse.yolo_detected === undefined || aiResponse.yolo_detected === null
            ? null
            : aiResponse.yolo_detected
              ? 1
              : 0,
          aiResponse.annotated_image_url || null,
        ]
      );
      detectionId = insertDetection.insertId;

      await query(
        `INSERT INTO search_history (
           searched_code, result, detection_id, admin_id, source, global_confidence, evidence_path,
           detection_mode, source_match, camera_name, zone, confidence
         ) VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          aiResponse.detected ? 'detected' : 'not_detected',
          detectionId,
          adminId,
          aiResponse.global_confidence != null ? Number(aiResponse.global_confidence) : null,
          evidencePath,
          aiResponse.detection_mode || null,
          aiResponse.source_match || null,
          aiResponse.camera_name || null,
          aiResponse.zone || null,
          aiResponse.confidence != null ? Number(aiResponse.confidence) : null,
        ]
      );
    } catch (dbError) {
      console.warn('[DB] Impossible de sauvegarder en base :', dbError.message);
    }

    // --- Phase 1 : suivi de la dernière position + historique des déplacements ---
    if (aiResponse.detected) {
      try {
        await recordDetection({
          containerCode: aiResponse.detected_code || aiResponse.searched_code || code,
          cameraId: raw.camera_id || null,
          cameraName: aiResponse.camera_name,
          zone: aiResponse.zone,
          confidence: aiResponse.confidence,
          proofImagePath: evidencePath,
          proofImageUrl: raw.proof_image_url || result.proof_image_url || null,
          detectedAt: aiResponse.detected_at,
          source: 'manual',
          detectionMode: aiResponse.detection_mode,
          orientation: raw.orientation || null,
          ocrQuality: raw.ocr_quality || null,
          partialCodeDetected: raw.partial_code_detected || false,
          matchedCode: raw.matched_code || null,
          matchScore: raw.match_score ?? null,
          rawOcrText: raw.raw_ocr_text || null,
        });
      } catch (tErr) {
        console.warn('[Tracking] search :', tErr.message);
      }
    }

    // Phase 5 : OCR douteux / code partiel même si le conteneur n'est pas confirmé.
    try {
      if (!aiResponse.detected && (raw.ocr_quality || raw.partial_code_detected)) {
        const { reportOcrQuality } = require('../services/alertService');
        await reportOcrQuality({
          container_code: raw.matched_code || aiResponse.searched_code || code,
          zone: aiResponse.zone || null,
          camera_id: raw.camera_id || null,
          camera_name: aiResponse.camera_name || null,
          proof_image_url: evidencePath,
          ocr_quality: raw.ocr_quality || null,
          partial_code_detected: raw.partial_code_detected || false,
          matched_code: raw.matched_code || null,
          match_score: raw.match_score ?? null,
          raw_ocr_text: raw.raw_ocr_text || null,
          source: 'search',
          source_context: 'search_no_match',
        });
      }
    } catch (oErr) {
      console.warn('[Alertes] OCR search :', oErr.message);
    }

    try {
      if (aiResponse.detected) {
        await createNotification({
          type: 'detection',
          title: 'Conteneur détecté',
          message: `${aiResponse.searched_code} — ${aiResponse.camera_name || ''} (${aiResponse.zone || ''})`,
          payload: {
            detectionId,
            searched_code: aiResponse.searched_code,
            camera_name: aiResponse.camera_name,
            global_confidence: aiResponse.global_confidence,
          },
        });
      } else if (aiResponse.detection_status === 'low_confidence') {
        await createNotification({
          type: 'alert',
          title: 'Confiance faible',
          message: aiResponse.message || 'Correspondance OCR sous le seuil.',
          payload: { detectionId, searched_code: aiResponse.searched_code },
        });
      }
      const g = aiResponse.global_confidence != null ? Number(aiResponse.global_confidence) : 0;
      if (aiResponse.detected && g >= 0.85) {
        await createNotification({
          type: 'high_confidence',
          title: 'Confiance élevée',
          message: `Score global ${Math.round(g * 100)}% pour ${aiResponse.searched_code}`,
          payload: { detectionId },
        });
      }
    } catch (n) {
      console.warn('[Notifications]', n.message);
    }

    try {
      req.app.get('io')?.emit('detection_update', {
        detectionId,
        ...aiResponse,
        evidence_path: evidencePath,
      });
    } catch {
      /* ignore */
    }

    // --- Phase 1 : dernière position connue + timeline (toujours renvoyées) ---
    const trackingCode = aiResponse.detected_code || aiResponse.searched_code || code;
    let lastPosition = null;
    let movements = [];
    let activeAlerts = [];
    let proofs = [];
    try {
      lastPosition = await getLastPosition(trackingCode);
      movements = await getMovements(trackingCode, 20);
      activeAlerts = await getActiveAlertsForContainer(trackingCode);
      proofs = await require('../services/visualProofService').getProofsForContainer(trackingCode, 20);
    } catch (tErr) {
      console.warn('[Tracking] enrich search :', tErr.message);
    }

    // Si non détecté en direct mais présent dans l'historique : on l'indique.
    const hasHistory = Boolean(lastPosition && lastPosition.last_detected_at);
    const foundEffective = aiResponse.detected || hasHistory;

    // Phase 6 : audit de la recherche conteneur.
    try {
      const audit = require('../services/auditService');
      await audit.logSuccess({
        admin: req.admin,
        req,
        action: 'container.search',
        resource_type: 'container',
        resource_id: code,
        details: { detected: aiResponse.detected, has_known_position: hasHistory },
      });
    } catch (_) { /* audit best effort */ }

    return res.json({
      success: true,
      data: {
        id: detectionId,
        ...aiResponse,
        found_effective: foundEffective,
        has_known_position: hasHistory,
        live_detected: aiResponse.detected,
        last_position: lastPosition,
        movements,
        alerts: activeAlerts,
        proofs,
        proof: proofs[0]
          ? {
              originalUrl: proofs[0].originalUrl || proofs[0].image_url,
              annotatedUrl: proofs[0].annotatedUrl || proofs[0].image_url,
            }
          : null,
        elapsed_since_last_detection: lastPosition?.elapsed_since_last_detection || null,
        needs_verification: lastPosition?.needs_verification || false,
        // Phase 5 : champs OCR/YOLO (repli sur la dernière position connue si l'IA
        // n'a pas été rappelée — ex. réponse servie par le cache "stored").
        matched_code: raw.matched_code || aiResponse.detected_code || null,
        match_score: raw.match_score ?? aiResponse.similarity_score ?? null,
        match_type: raw.match_type || aiResponse.match_type || null,
        ocr_quality: raw.ocr_quality || lastPosition?.ocr_quality || null,
        partial_code_detected: Boolean(raw.partial_code_detected),
        raw_ocr_text: raw.raw_ocr_text || null,
        normalized_codes: raw.normalized_codes || null,
        orientation: raw.orientation || lastPosition?.orientation || 'unknown',
        container_detected: raw.container_detected ?? null,
        code_area_detected: raw.code_area_detected ?? null,
        seal_detected: raw.seal_detected ?? null,
        yolo_model_mode: raw.yolo_model_mode || null,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { searchContainer };
