/**
 * Container Vision Client — Service de détection réutilisable.
 *
 * Ce module fournit une interface normalisée pour appeler l'API de détection
 * de conteneurs. Il peut être utilisé par :
 *   - Le backend Express (routes existantes)
 *   - Un bot WhatsApp (via botWhatsappManager.js)
 *   - Tout service externe qui a besoin de vérifier la présence d'un conteneur
 *
 * Usage depuis un bot WhatsApp :
 *   const { searchContainer } = require('./services/containerVisionClient');
 *   const result = await searchContainer('MSCU1234567');
 *   // result = { code, detected, camera, zone, confidence, ... }
 */

const axios = require('axios');
const { findStoredContainer } = require('./storedDetectionService');
const { resolvePublicProofUrl } = require('./proofUrlService');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8001';
const TIMEOUT_MS = 120000;

function buildClientResult(code, data) {
  const detected = Boolean(data.detected);
  const proofUrl =
    data.source_match === 'demo_index'
      ? (data.matched_image || data.evidence_image_url || data.image_path || null)
      : (data.evidence_image_url || data.image_path || null);
  const evidenceImageUrl = detected ? proofUrl : null;
  const confidence = detected ? (data.confidence || 0) : 0;

  return {
    code: data.searched_code || code,
    detected,
    camera: detected ? (data.camera_name || null) : null,
    zone: detected ? (data.zone || null) : null,
    confidence,
    confidencePercent: detected && confidence
      ? `${(confidence * 100).toFixed(1)}%`
      : '0%',
    evidenceImageUrl,
    proof_image_url: detected ? resolvePublicProofUrl(evidenceImageUrl) : null,
    annotatedImageUrl: detected ? (data.annotated_image_url || null) : null,
    timestamp: data.detected_at || new Date().toISOString(),
    message: data.message || (detected ? 'Conteneur détecté' : 'Conteneur non trouvé'),
    error: false,
    raw: data,
    source_match: data.source_match || null,
    match_type: data.match_type || null,
    matched_image: data.matched_image || data.image_path || data.evidence_image_url || null,
    detected_code: data.detected_code || data.container_code || null,
  };
}

/**
 * Pour un code ISO 11 caractères, exige que detected_code (si fourni par l’IA)
 * ait le même préfixe propriétaire 4 lettres — filet de sécurité côté backend.
 */
function isAiDetectionConsistent(requestedNorm, data) {
  const want = String(requestedNorm || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (data && data.source_match === 'demo_index') {
    return true;
  }
  if (want.length !== 11 || !/^[A-Z]{4}\d{7}$/.test(want)) return true;
  const det = String(data.detected_code || '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
  if (!det) return true;
  if (det.length < 11) return false;
  return det.slice(0, 4) === want.slice(0, 4);
}

/**
 * Recherche un conteneur via le service IA.
 *
 * @param {string} containerCode - Identifiant du conteneur (ex: "79943", "MSCU1234567")
 * @returns {Promise<Object>} Résultat normalisé de la détection
 *
 * @example
 * const result = await searchContainer('79943');
 * // {
 * //   code: '79943',
 * //   detected: true,
 * //   camera: 'CAM_01',
 * //   zone: 'Zone A - Quai Nord',
 * //   confidence: 0.93,
 * //   confidencePercent: '93.0%',
 * //   evidenceImageUrl: null,
 * //   timestamp: '2026-04-25T10:30:00',
 * //   message: 'Conteneur détecté dans les caméras analysées',
 * //   raw: { ... }
 * // }
 */
async function searchContainer(containerCode) {
  const code = String(containerCode).trim().replace(/[\s\-\.]+/g, '').toUpperCase();

  if (!code || code.length < 3) {
    return {
      code,
      detected: false,
      camera: null,
      zone: null,
      confidence: 0,
      confidencePercent: '0%',
      evidenceImageUrl: null,
      timestamp: new Date().toISOString(),
      message: 'Identifiant conteneur invalide ou trop court.',
      error: true,
      raw: null,
    };
  }

  try {
    const stored = await findStoredContainer(code);
    if (stored) {
      console.log(`[VISION] Match local (stored) code="${code}" source=${stored.source_match}`);
      return buildClientResult(code, stored);
    }

    const { data } = await axios.post(
      `${AI_SERVICE_URL}/detect`,
      { container_code: code },
      { timeout: TIMEOUT_MS }
    );

    const aiSaysDetected = Boolean(data.detected);
    const consistent = isAiDetectionConsistent(code, data);
    const detected = aiSaysDetected && consistent;
    const proofUrl =
      data.source_match === 'demo_index'
        ? (data.matched_image || data.evidence_image_url || data.image_path || null)
        : (data.evidence_image_url || data.image_path || null);
    const evidenceImageUrl =
      detected
        ? proofUrl
        : null;
    const annotatedImageUrl = detected ? (data.annotated_image_url || null) : null;

    let message =
      data.message || (detected ? 'Conteneur détecté' : 'Conteneur non trouvé');
    if (aiSaysDetected && !consistent) {
      message =
        `Réponse incohérente pour le code ${code} (préfixe ISO différent de celui détecté). ` +
        'Traitement comme non détecté.';
    }

    const clientResult = {
      code: data.searched_code || code,
      detected,
      camera: detected ? (data.camera_name || null) : null,
      zone: detected ? (data.zone || null) : null,
      confidence: detected ? (data.confidence || 0) : 0,
      confidencePercent: detected && data.confidence
        ? `${(data.confidence * 100).toFixed(1)}%`
        : '0%',
      evidenceImageUrl,
      annotatedImageUrl,
      timestamp: data.detected_at || new Date().toISOString(),
      message,
      error: false,
      raw: data,
      source_match: data.source_match || null,
      match_type: data.match_type || null,
      matched_image: data.matched_image || data.image_path || data.evidence_image_url || null,
      detected_code: data.detected_code || null,
    };

    if (!detected) {
      const fallback = await findStoredContainer(code);
      if (fallback) {
        console.log(`[VISION] Fallback local après scan IA code="${code}"`);
        return buildClientResult(code, fallback);
      }
    }

    return clientResult;
  } catch (err) {
    const errorMsg = err.response?.data?.detail
      || err.message
      || 'Service IA indisponible';

    const fallback = await findStoredContainer(code).catch(() => null);
    if (fallback) {
      console.log(`[VISION] Fallback local (IA indisponible) code="${code}"`);
      return buildClientResult(code, fallback);
    }

    return {
      code,
      detected: false,
      camera: null,
      zone: null,
      confidence: 0,
      confidencePercent: '0%',
      evidenceImageUrl: null,
      timestamp: new Date().toISOString(),
      message: `Erreur : ${errorMsg}`,
      error: true,
      raw: null,
    };
  }
}

/**
 * Formate un résultat de détection en message texte (pour WhatsApp, SMS, etc.)
 *
 * @param {Object} result - Résultat de searchContainer()
 * @returns {string} Message formaté
 */
function formatAsTextMessage(result) {
  if (result.error) {
    return `⚠️ Erreur pour le conteneur ${result.code}\n${result.message}`;
  }

  const raw = result.raw || {};
  const sourceMatch = result.source_match || raw.source_match;
  const sourceLabel =
    sourceMatch === 'demo_index'
      ? 'Index démo'
      : sourceMatch === 'upload'
        ? 'Analyse image enregistrée'
        : sourceMatch === 'stored_registry'
          ? 'Historique enregistré'
          : sourceMatch === 'yolo'
            ? 'YOLO + OCR'
            : sourceMatch === 'ocr'
              ? 'OCR caméras'
              : 'Analyse caméras';
  const ocrUsed = raw.ocr_used !== false;
  const yoloUsed = Boolean(raw.yolo_detected);
  const proofPublic = result.proof_image_url || null;
  const proofNote = result.whatsapp_image_note || null;

  if (result.detected) {
    const lines = [
      `📦 Conteneur ${result.code}`,
      '',
      '✅ Détecté',
      `📍 Zone : ${result.zone || 'Inconnue'}`,
      `🎥 Caméra : ${result.camera || 'Inconnue'}`,
      `🎯 Confiance : ${result.confidencePercent || 'N/A'}`,
      `🧠 OCR : ${ocrUsed ? 'oui' : 'non'}`,
      `🤖 YOLO : ${yoloUsed ? 'oui' : 'non'}`,
      `📊 Source : ${sourceLabel}`,
      `🕒 Détecté le : ${new Date(result.timestamp).toLocaleString('fr-FR')}`,
    ];
    if (proofPublic && result.whatsapp_image_sendable) {
      lines.push(`🖼 Image preuve : ${proofPublic}`);
    } else if (proofPublic) {
      lines.push(`🖼 Image preuve (web) : ${proofPublic}`);
      if (proofNote) lines.push('', `ℹ️ ${proofNote}`);
    } else if (proofNote) {
      lines.push('', `ℹ️ ${proofNote}`);
    }
    return lines.join('\n');
  }

  const camerasList = raw.cameras_scanned_list || ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04'];
  const scanned = raw.images_analyzed ?? raw.cameras_scanned;
  return [
    `📦 Conteneur ${result.code}`,
    '',
    '❌ Non détecté',
    'Le conteneur n\'a pas été trouvé dans les caméras disponibles.',
    `Caméras analysées : ${camerasList.join(', ')}.`,
    scanned != null ? `Images analysées : ${scanned}` : '',
    '',
    'Veuillez vérifier le code ou réessayer plus tard.',
  ].filter(Boolean).join('\n');
}

module.exports = { searchContainer, formatAsTextMessage };
