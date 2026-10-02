const crypto = require('crypto');
const { searchContainer, formatAsTextMessage } = require('../services/containerVisionClient');
const { query } = require('../config/database');
const { createNotification } = require('../services/notificationService');
const { mapDetectionMode } = require('../utils/detectionLabels');
const {
  resolveWebProofUrl,
  resolveIntegrationProofUrl,
  normalizeProofRelativePath,
  whatsappProofNote,
  isLocalhostUrl,
} = require('../services/proofUrlService');
const { inspectProofAsset } = require('../services/proofMediaService');
const { recordDetection, getLastPosition, getMovements } = require('../services/containerTrackingService');
const { getActiveAlertsForContainer } = require('../services/alertService');
const { dashboardUrl, mapUrl } = require('../utils/publicUrl');
const { CAMERAS, ZONES, resolveZoneId } = require('../config/terminalMap');
const visualProofService = require('../services/visualProofService');
const audit = require('../services/auditService');

// Phase 7 : construit les objets structurés + statut intelligent.
function buildCameraObject(cameraId, cameraName) {
  const key = cameraId || cameraName;
  if (!key) return null;
  const cam = CAMERAS.find(
    (c) => c.id === key || c.name === key || c.id === cameraName || c.name === cameraName
  );
  return {
    id: cam?.id || cameraId || cameraName || null,
    name: cam?.name || cameraName || cameraId || null,
    status: cam?.status || 'unknown',
  };
}

function buildZoneObject(zoneLabelOrId, cameraId) {
  const zid = resolveZoneId(zoneLabelOrId) || resolveZoneId(cameraId);
  if (!zid) {
    return zoneLabelOrId ? { id: null, name: zoneLabelOrId, label: zoneLabelOrId } : null;
  }
  const z = ZONES.find((zz) => zz.id === zid);
  return { id: z.id, name: z.name, label: z.zone_label };
}

function computeStatus({ detected, hasKnownPosition, raw, lastPosition }) {
  const partial = Boolean(raw.partial_code_detected);
  const weakOcr = ['faible', 'à vérifier'].includes(raw.ocr_quality || lastPosition?.ocr_quality || '');
  const uncertainSignal = partial || weakOcr;
  if (detected) return uncertainSignal ? 'uncertain' : 'detected';
  if (uncertainSignal && (hasKnownPosition || raw.matched_code)) return 'uncertain';
  if (hasKnownPosition) return 'known_position';
  return 'not_found';
}

function alertNote(alerts) {
  if (!alerts || alerts.length === 0) return '';
  const types = new Set(alerts.map((a) => a.type));
  const notes = [];
  if (types.has('OLD_POSITION')) notes.push('la dernière position est ancienne, à confirmer sur le terrain');
  if (types.has('OCR_SUSPICIOUS')) notes.push("la lecture OCR est incertaine, une vérification humaine est recommandée");
  if (types.has('WRONG_ZONE')) notes.push('le conteneur se trouve dans une zone inattendue');
  if (types.has('IMMOBILIZED_TOO_LONG')) notes.push('le conteneur est immobilisé depuis longtemps');
  return notes.length ? ` Attention : ${notes.join(' ; ')}.` : '';
}

function buildStatusMessage({ status, code, zoneObj, cameraObj, confidencePercent, lastPosition, alerts }) {
  const zoneName = zoneObj?.name || zoneObj?.label || lastPosition?.last_zone || 'zone inconnue';
  const camName = cameraObj?.name || cameraObj?.id || lastPosition?.last_camera_name || 'caméra inconnue';
  const elapsed = lastPosition?.elapsed_since_last_detection || 'récemment';
  let base;
  switch (status) {
    case 'detected':
      base = `Le conteneur ${code} a été détecté dans la ${zoneName}, caméra ${camName}, avec une confiance de ${confidencePercent ?? '—'} %.`;
      break;
    case 'known_position':
      base = `Le conteneur ${code} n'a pas été détecté en direct, mais sa dernière position connue est la ${zoneName}, caméra ${camName}, ${elapsed}.`;
      break;
    case 'uncertain':
      base = `Une correspondance possible a été trouvée pour ${code}, mais l'OCR est incertain. Une vérification humaine est recommandée.`;
      break;
    case 'not_found':
    default:
      base = `Aucune position connue n'a été trouvée pour le conteneur ${code}.`;
      break;
  }
  return base + alertNote(alerts);
}

async function integrationSearch(req, res, next) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const requestCreatedAt = new Date().toISOString();
  const {
    container_code,
    source,
    requester,
    include_history = true,
    include_alerts = true,
    include_map = true,
    include_proof = true,
  } = req.body;
  const callerSource = source || 'unknown';

  if (!container_code || String(container_code).trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Le champ container_code est requis.',
      request_id: requestId,
    });
  }

  const code = String(container_code).trim().replace(/[\s\-\.]+/g, '').toUpperCase();

  console.log(`[INTEGRATION] Recherche : code="${code}" source="${callerSource}" requester="${requester || 'n/a'}" request_id=${requestId}`);

  // Phase 7 : audit de l'appel d'intégration (clé masquée par le service d'audit).
  try {
    await audit.logSuccess({
      req,
      actor: `integration:${callerSource}`,
      action: 'integration.container_search',
      resource_type: 'container',
      resource_id: code,
      details: { source: callerSource, requester: requester || null, request_id: requestId },
    });
  } catch (_) { /* best effort */ }

  try {
    const result = await searchContainer(code);
    const raw = result.raw || {};
    const elapsed = Date.now() - startTime;

    console.log(
      `[INTEGRATION] Résultat : code="${code}" detected=${result.detected} ` +
      `confidence=${result.confidence} global=${raw.global_confidence ?? 'n/a'} ` +
      `source_match=${raw.source_match ?? 'n/a'} ` +
      `source="${callerSource}" time=${elapsed}ms`
    );

    try {
      const evidence = result.detected
        ? (
            (raw.source_match === 'demo_index' && (raw.matched_image || raw.evidence_image_url || raw.image_path))
            || raw.evidence_image_url
            || raw.image_path
            || raw.annotated_image_url
            || result.evidenceImageUrl
            || null
          )
        : null;
      await query(
        `INSERT INTO search_history (
           searched_code, result, admin_id, source, global_confidence, evidence_path,
           detection_mode, source_match, camera_name, zone, confidence
         ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          result.detected ? 'detected' : 'not_detected',
          callerSource,
          raw.global_confidence != null
            ? Number(raw.global_confidence)
            : result.confidence != null
              ? Number(result.confidence)
              : null,
          evidence,
          mapDetectionMode(raw.source_match, raw.pipeline_mode),
          raw.source_match || null,
          result.detected ? result.camera : null,
          result.detected ? result.zone : null,
          result.detected && raw.confidence != null ? Number(raw.confidence) : null,
        ]
      );
    } catch (dbErr) {
      console.warn('[INTEGRATION][DB] Sauvegarde historique échouée :', dbErr.message);
    }

    // --- Phase 1 : suivi position (intégration) ---
    if (result.detected) {
      try {
        await recordDetection({
          containerCode: result.detected_code || result.code || code,
          cameraId: raw.camera_id || null,
          cameraName: result.camera,
          zone: result.zone,
          confidence: raw.confidence != null ? Number(raw.confidence) : result.confidence,
          proofImagePath: raw.evidence_image_url || raw.image_path || null,
          proofImageUrl: result.proof_image_url || null,
          detectedAt: result.timestamp || new Date(),
          source: callerSource || 'whatsapp-bot',
          detectionMode: mapDetectionMode(raw.source_match, raw.pipeline_mode),
          orientation: raw.orientation || null,
          ocrQuality: raw.ocr_quality || null,
          partialCodeDetected: raw.partial_code_detected || false,
          matchedCode: raw.matched_code || null,
          matchScore: raw.match_score ?? null,
          rawOcrText: raw.raw_ocr_text || null,
        });
      } catch (tErr) {
        console.warn('[Tracking] integration :', tErr.message);
      }
    }

    // Phase 5 : OCR douteux / code partiel même si non détecté (intégration).
    try {
      if (!result.detected && (raw.ocr_quality || raw.partial_code_detected)) {
        const { reportOcrQuality } = require('../services/alertService');
        await reportOcrQuality({
          container_code: raw.matched_code || code,
          zone: null,
          camera_id: raw.camera_id || null,
          ocr_quality: raw.ocr_quality || null,
          partial_code_detected: raw.partial_code_detected || false,
          matched_code: raw.matched_code || null,
          match_score: raw.match_score ?? null,
          raw_ocr_text: raw.raw_ocr_text || null,
          source: callerSource || 'integration',
          source_context: 'integration_no_match',
        });
      }
    } catch (oErr) {
      console.warn('[INTEGRATION][OCR]', oErr.message);
    }

    try {
      if (result.detected) {
        await createNotification({
          type: 'integration_detection',
          title: 'Détection (intégration)',
          message: `${code} — ${result.camera || ''}`,
          payload: {
            source: callerSource,
            detected: true,
            camera: result.camera,
            zone: result.zone,
            global_confidence: raw.global_confidence,
          },
        });
      }
    } catch (e) {
      console.warn('[INTEGRATION][Notifications]', e.message);
    }

    const confidencePercent = result.confidence
      ? Math.round(result.confidence * 100)
      : null;

    const globalPct =
      raw.global_confidence != null
        ? Math.round(raw.global_confidence * 100)
        : confidencePercent;

    const yoloPct =
      raw.yolo_confidence != null ? Math.round(Number(raw.yolo_confidence) * 100) : null;
    const ocrPct =
      raw.ocr_confidence != null
        ? Math.round(Number(raw.ocr_confidence) * 100)
        : confidencePercent;

    const mode = process.env.DETECTION_MODE || 'demo';

    const demoIndexProof =
      result.detected && raw.source_match === 'demo_index'
        ? (raw.matched_image || raw.evidence_image_url || raw.image_path || null)
        : null;
    const storedProof =
      result.detected && (raw.source_match === 'upload' || raw.source_match === 'stored_registry')
        ? (raw.evidence_image_url || raw.image_path || null)
        : null;
    const evidenceUrl = result.detected
      ? (demoIndexProof || storedProof || raw.evidence_image_url || raw.image_path || result.evidenceImageUrl || null)
      : null;
    const matchedImageUrl = result.detected
      ? (raw.matched_image || raw.image_path || raw.evidence_image_url || evidenceUrl || null)
      : null;

    console.log(
      `[INTEGRATION] preuve code=${code} source_match=${raw.source_match ?? 'n/a'} ` +
      `evidence=${evidenceUrl ?? 'null'} matched_image=${matchedImageUrl ?? 'null'}`
    );

    const detectionMode = mapDetectionMode(raw.source_match, raw.pipeline_mode);
    const proofImageRelativePath = result.detected ? normalizeProofRelativePath(evidenceUrl) : null;
    let proofInspection = { available: false, mimeType: null, size: 0, reason: 'no_evidence' };
    if (result.detected && evidenceUrl) {
      proofInspection = await inspectProofAsset(evidenceUrl);
    }
    const proofImageWebUrl = result.detected && proofInspection.available
      ? resolveWebProofUrl(evidenceUrl)
      : null;
    const integrationUrl = result.detected && proofInspection.available
      ? resolveIntegrationProofUrl(evidenceUrl)
      : null;
    const whatsappImageUrl = integrationUrl && !isLocalhostUrl(integrationUrl) ? integrationUrl : null;
    const proofImageUrl = whatsappImageUrl || null;
    const proofAvailable = Boolean(proofInspection.available && proofImageUrl);
    const proofMimeType = proofAvailable ? proofInspection.mimeType : null;
    const whatsappImageNote = result.detected ? whatsappProofNote(whatsappImageUrl) : null;
    const whatsappImageSendable = Boolean(proofAvailable && whatsappImageUrl && !isLocalhostUrl(whatsappImageUrl));

    // --- Phase 1 : dernière position connue + timeline / Phase 3 : alertes ---
    let lastPosition = null;
    let movements = [];
    let activeAlerts = [];
    try {
      const trackCode = result.detected_code || result.code || code;
      lastPosition = await getLastPosition(trackCode);
      movements = await getMovements(trackCode, 10);
      activeAlerts = await getActiveAlertsForContainer(trackCode);
    } catch (tErr) {
      console.warn('[Tracking] integration enrich :', tErr.message);
    }
    const hasKnownPosition = Boolean(lastPosition && lastPosition.last_detected_at);
    const foundEffective = result.detected || hasKnownPosition;

    // --- Phase 7 : statut intelligent + objets structurés + preuve + liens ---
    const status = computeStatus({ detected: result.detected, hasKnownPosition, raw, lastPosition });

    const effectiveZoneLabel = result.detected
      ? (result.zone || null)
      : (lastPosition?.last_zone || null);
    const effectiveCameraId = result.detected
      ? (raw.camera_id || null)
      : (lastPosition?.last_camera_id || null);
    const effectiveCameraName = result.detected
      ? (result.camera || null)
      : (lastPosition?.last_camera_name || null);

    const cameraObj = buildCameraObject(effectiveCameraId, effectiveCameraName);
    const zoneObj = buildZoneObject(effectiveZoneLabel, effectiveCameraId);

    const statusMessage = buildStatusMessage({
      status,
      code,
      zoneObj,
      cameraObj,
      confidencePercent,
      lastPosition,
      alerts: include_alerts ? activeAlerts : [],
    });

    // Preuve visuelle (dernière preuve enregistrée sinon preuve courante).
    let proofObject = { available: false, image_url: null, thumbnail_url: null, source: null, captured_at: null };
    if (include_proof) {
      try {
        const latestProof = await visualProofService.getLatestProofForContainer(
          result.detected_code || result.code || code
        );
        if (latestProof && latestProof.image_url) {
          const publicProof = proofImageUrl || (
            latestProof.public_url && !isLocalhostUrl(latestProof.public_url) ? latestProof.public_url : null
          );
          proofObject = {
            available: Boolean(publicProof),
            proof_id: latestProof.proof_id,
            image_url: publicProof,
            thumbnail_url: publicProof,
            source: latestProof.source,
            camera_id: latestProof.camera_id,
            zone: latestProof.zone,
            captured_at: latestProof.captured_at,
          };
        } else if (proofAvailable && proofImageUrl) {
          const proofPublic = whatsappImageUrl || proofImageUrl;
          proofObject = {
            available: true,
            image_url: proofPublic,
            thumbnail_url: proofPublic,
            mime_type: proofMimeType,
            source: raw.source_match || callerSource,
            captured_at: result.timestamp || null,
          };
        }
      } catch (pe) {
        console.warn('[INTEGRATION][Proof]', pe.message);
      }
    }

    // Liens publics (dashboard + carte).
    const zoneMeta = zoneObj?.id ? ZONES.find((z) => z.id === zoneObj.id) : null;
    const dashUrl = dashboardUrl(code);
    const mapLinkUrl = mapUrl({
      zone: zoneMeta?.zone_label || effectiveZoneLabel || undefined,
      camera: effectiveCameraId || zoneMeta?.camera_id || undefined,
      code,
    });

    const alertsSummary = (include_alerts ? activeAlerts : []).map((a) => ({
      type: a.type,
      severity: a.severity,
      message: a.message,
      status: a.status,
      created_at: a.created_at,
    }));

    const whatsappMessage = formatAsTextMessage({
      ...result,
      raw,
      detection_mode: detectionMode,
      source_match: raw.source_match,
      images_analyzed: raw.images_analyzed ?? raw.cameras_scanned,
      proof_image_url: proofImageUrl,
      whatsapp_image_note: whatsappImageNote,
      whatsapp_image_sendable: whatsappImageSendable,
      confidencePercent: result.confidencePercent || (confidencePercent != null ? `${confidencePercent}%` : 'N/A'),
      last_position: lastPosition,
      elapsed_since_last_detection: lastPosition?.elapsed_since_last_detection || null,
    });

    const response = {
      // --- Phase 7 : enveloppe stable + structurée ---
      success: true,
      status,
      camera: result.detected ? (cameraObj) : cameraObj,
      zone: result.detected ? zoneObj : zoneObj,
      proof: proofObject,
      tracking: {
        movements_count: movements.length,
        recent_movements: include_history ? movements.slice(0, 5) : [],
      },
      ocr: {
        quality: raw.ocr_quality || lastPosition?.ocr_quality || null,
        matched_code: raw.matched_code || raw.detected_code || null,
        match_score: raw.match_score ?? null,
        partial_code_detected: Boolean(raw.partial_code_detected),
      },
      yolo: {
        model_mode: raw.yolo_model_mode || 'unavailable',
        container_detected: raw.container_detected ?? null,
        orientation: lastPosition?.orientation || raw.orientation || 'unknown',
      },
      map: include_map ? { zone_id: zoneObj?.id || null, map_url: mapLinkUrl, dashboard_url: dashUrl } : null,
      dashboard_url: dashUrl,
      map_url: include_map ? mapLinkUrl : null,
      audit: { request_id: requestId, created_at: requestCreatedAt },
      request_id: requestId,
      // --- Champs historiques (rétrocompatibilité) ---
      found: foundEffective,
      container_code: result.code,
      code: result.code,
      detected: result.detected,
      live_detected: result.detected,
      has_known_position: hasKnownPosition,
      last_position: lastPosition,
      last_detected_at: lastPosition?.last_detected_at || (result.detected ? result.timestamp : null),
      elapsed_since_last_detection: lastPosition?.elapsed_since_last_detection || null,
      needs_verification: lastPosition?.needs_verification || false,
      movements_history: movements,
      map_zone: result.detected ? result.zone : (lastPosition?.last_zone || null),
      zone_label: effectiveZoneLabel,
      orientation: lastPosition?.orientation || raw.orientation || 'unknown',
      ocr_quality: lastPosition?.ocr_quality || raw.ocr_quality || null,
      partial_code_detected: Boolean(raw.partial_code_detected),
      // Phase 5 : champs OCR/YOLO avancés
      raw_ocr_text: raw.raw_ocr_text || null,
      normalized_codes: raw.normalized_codes || null,
      matched_code: raw.matched_code || raw.detected_code || null,
      match_score: raw.match_score ?? null,
      container_detected: raw.container_detected ?? null,
      code_area_detected: raw.code_area_detected ?? null,
      seal_detected: raw.seal_detected ?? null,
      door_detected: raw.door_detected ?? null,
      yolo_model_mode: raw.yolo_model_mode || null,
      alerts: include_alerts ? activeAlerts : [],
      camera_id: result.detected ? (raw.camera_id || result.camera) : (lastPosition?.last_camera_id || null),
      camera_name: result.detected ? result.camera : (lastPosition?.last_camera_name || null),
      confidence: result.detected ? confidencePercent : null,
      global_confidence: result.detected ? globalPct : null,
      yolo_detected: Boolean(raw.yolo_detected),
      yolo_confidence: yoloPct,
      ocr_confidence: ocrPct,
      ocr_used: raw.ocr_used !== false,
      timestamp: result.timestamp,
      mode,
      detection_mode: detectionMode,
      evidence_image_url: evidenceUrl,
      proof_image_relative_path: proofImageRelativePath,
      proof_image_url: proofImageUrl,
      proofImageUrl: proofImageUrl,
      proofAvailable,
      proof_available: proofAvailable,
      proofMimeType,
      proof_mime_type: proofMimeType,
      proof_image_web_url: proofImageWebUrl,
      whatsapp_image_url: whatsappImageUrl,
      whatsapp_image_sendable: whatsappImageSendable,
      whatsapp_image_note: whatsappImageNote,
      annotated_image_url: result.detected ? (raw.annotated_image_url || null) : null,
      matched_image: matchedImageUrl,
      message: statusMessage,
      whatsapp_message: whatsappMessage,
      source_match: raw.source_match ?? result.source_match ?? 'none',
      match_type: raw.match_type ?? result.match_type ?? 'none',
      detected_code: raw.detected_code ?? result.detected_code ?? null,
      requested_code: raw.requested_code || raw.searched_code || code,
      images_analyzed: raw.images_analyzed ?? raw.cameras_scanned ?? null,
      cameras_scanned: raw.cameras_scanned ?? ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04'],
      last_detection: result.detected ? result.timestamp : null,
    };

    try {
      req.app.get('io')?.emit('detection_update', { source: 'integration', ...raw });
    } catch {
      /* ignore */
    }

    return res.json(response);
  } catch (err) {
    console.error(`[INTEGRATION] Erreur : code="${code}" source="${callerSource}" request_id=${requestId}`, err.stack || err.message);
    return res.status(500).json({
      success: false,
      status: 'error',
      error: 'Erreur interne pendant l\'analyse. Veuillez réessayer ou contacter l\'administrateur.',
      request_id: requestId,
    });
  }
}

module.exports = { integrationSearch };
