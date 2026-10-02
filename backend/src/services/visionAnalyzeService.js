const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const iso = require('../utils/iso6346');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

const CONTAINER_LIKE = new Set(['truck', 'bus', 'train', 'boat', 'container']);
const NON_CONTAINER = new Set([
  'person', 'chair', 'couch', 'bed', 'tv', 'laptop', 'cell phone', 'book', 'vase',
  'bottle', 'cup', 'dining table', 'potted plant', 'dog', 'cat', 'keyboard', 'mouse',
  'remote', 'clock', 'teddy bear', 'toothbrush', 'sink', 'toilet', 'oven', 'microwave',
  'refrigerator', 'umbrella', 'handbag', 'backpack', 'tie', 'suitcase',
]);

const pending = new Map();
const PENDING_TTL_MS = 20 * 60 * 1000;

function prunePending() {
  const now = Date.now();
  for (const [id, row] of pending) {
    if (now - row.createdAt > PENDING_TTL_MS) pending.delete(id);
  }
}

function yoloBox(det) {
  const b = det.bbox || det.box || det;
  if (b && (b.x != null || b.xmin != null)) {
    return {
      x: Number(b.x ?? b.xmin ?? 0),
      y: Number(b.y ?? b.ymin ?? 0),
      width: Number(b.width ?? (b.xmax - b.xmin) ?? 0),
      height: Number(b.height ?? (b.ymax - b.ymin) ?? 0),
    };
  }
  return null;
}

function decidePresence(ai) {
  const dets = Array.isArray(ai.yolo_detections) ? ai.yolo_detections : [];
  const classes = dets.map((d) => String(d.class_name || d.class || d.label || '').toLowerCase());
  const containerDets = dets.filter((d) => {
    const c = String(d.class_name || d.class || '').toLowerCase();
    return CONTAINER_LIKE.has(c) || c.includes('container');
  });
  const nonContainer = classes.some((c) => NON_CONTAINER.has(c));
  const hasLike = containerDets.length > 0;

  const codes = Array.isArray(ai.extracted_codes) ? ai.extracted_codes : [];
  const isoCodes = codes
    .map((c) => {
      const raw = c.normalized_code || c.code || c.text || '';
      const fixed = iso.cautiousOcrFix(raw);
      return {
        code: iso.isIsoFormat(fixed) ? fixed : iso.normalizeCode(raw),
        confidence: Number(c.confidence ?? c.score ?? ai.ocr_avg_confidence ?? 0),
        isoValid: iso.isoValid(fixed),
      };
    })
    .filter((c) => iso.isIsoFormat(c.code));
  isoCodes.sort((a, b) => b.confidence - a.confidence);
  const best = isoCodes[0] || null;
  const ocrAvg = Number(ai.ocr_avg_confidence ?? best?.confidence ?? 0);
  const yoloConf = containerDets.reduce((m, d) => Math.max(m, Number(d.confidence || 0)), 0);

  if (dets.length > 0 && nonContainer && !hasLike) {
    return {
      containerDetected: false,
      containerConfidence: 0,
      reason: 'yolo_scene_without_container',
      boundingBox: null,
    };
  }

  if (hasLike) {
    return {
      containerDetected: true,
      containerConfidence: yoloConf || 0.6,
      reason: 'yolo_container_like',
      boundingBox: yoloBox(containerDets[0]),
    };
  }

  if (best && best.isoValid && best.confidence >= 0.55) {
    return {
      containerDetected: true,
      containerConfidence: Math.max(best.confidence, ocrAvg),
      reason: 'iso_code_closeup',
      boundingBox: null,
    };
  }

  if (ai.container_detected === true && best) {
    return {
      containerDetected: true,
      containerConfidence: Number(ai.yolo_confidence || ocrAvg || 0.5),
      reason: 'ai_flag',
      boundingBox: yoloBox(dets[0]),
    };
  }

  return {
    containerDetected: false,
    containerConfidence: hasLike ? yoloConf : 0,
    reason: 'no_container_signal',
    boundingBox: null,
  };
}

function validationStatus({ containerDetected, ocrDetected, isoValid, containerConfidence, ocrConfidence }) {
  if (!containerDetected) return 'rejected';
  if (containerDetected && ocrDetected && isoValid && containerConfidence >= 0.75 && ocrConfidence >= 0.75) {
    return 'auto_validated';
  }
  if (containerDetected && (!ocrDetected || !isoValid || ocrConfidence < 0.75)) {
    return 'needs_review';
  }
  return 'needs_review';
}

async function runAiOnBuffer(file, { mode = 'yolo_ocr', matchCode = '' } = {}) {
  const form = new FormData();
  form.append('file', file.buffer, {
    filename: file.originalname || 'scan.jpg',
    contentType: file.mimetype || 'image/jpeg',
  });
  if (matchCode) form.append('container_code', matchCode);
  form.append('mode', mode);

  const { data } = await axios.post(`${AI_SERVICE_URL}/experimental/detect-image`, form, {
    headers: form.getHeaders(),
    maxBodyLength: 40 * 1024 * 1024,
    maxContentLength: 40 * 1024 * 1024,
    timeout: 300000,
  });
  return data;
}

function toClientResult(ai, extras = {}) {
  const presence = decidePresence(ai);
  const codes = Array.isArray(ai.extracted_codes) ? ai.extracted_codes : [];
  let code = null;
  let ocrConfidence = null;
  let isoValid = false;
  if (presence.containerDetected) {
    const candidate = codes[0];
    const raw = candidate?.normalized_code || candidate?.code || null;
    if (raw) {
      const fixed = iso.cautiousOcrFix(raw);
      code = iso.isIsoFormat(fixed) ? fixed : iso.normalizeCode(raw);
      ocrConfidence = Number(candidate.confidence ?? ai.ocr_avg_confidence ?? 0);
      isoValid = iso.isoValid(code);
    }
  }

  const ocrDetected = Boolean(presence.containerDetected && code);
  const status = validationStatus({
    containerDetected: presence.containerDetected,
    ocrDetected,
    isoValid,
    containerConfidence: presence.containerConfidence,
    ocrConfidence: ocrConfidence || 0,
  });

  return {
    success: true,
    containerDetected: presence.containerDetected,
    containerConfidence: presence.containerConfidence,
    ocrDetected,
    code: presence.containerDetected ? code : null,
    ocrConfidence: presence.containerDetected ? ocrConfidence : null,
    isoValid: presence.containerDetected ? isoValid : false,
    requiresReview: status === 'needs_review',
    validationStatus: presence.containerDetected ? status : 'rejected',
    boundingBox: presence.boundingBox || undefined,
    reason: presence.reason,
    pipeline: 'yolo_ocr',
    yoloDetectionCount: ai.yolo_detection_count ?? (ai.yolo_detections || []).length,
    yoloClasses: (ai.yolo_detections || []).map((d) => d.class_name || d.class).filter(Boolean),
    camera: extras.camera || null,
    sourceType: extras.sourceType || 'mobile',
    analyzedAt: new Date().toISOString(),
    proof: extras.proof || { original: extras.originalDataUri || null, annotated: null },
    rawHints: {
      extractedCount: codes.length,
      ocrAvg: ai.ocr_avg_confidence ?? null,
      message: ai.message || null,
    },
  };
}

async function analyzeWithoutPersist(file, extras = {}) {
  prunePending();
  const ai = await runAiOnBuffer(file, { mode: 'yolo_ocr', matchCode: extras.matchCode });
  const mapped = toClientResult(ai, extras);
  const analysisId = crypto.randomBytes(12).toString('hex');
  pending.set(analysisId, {
    createdAt: Date.now(),
    file,
    ai,
    mapped,
    extras,
  });
  return { analysisId, ...mapped };
}

function getPending(analysisId) {
  prunePending();
  return pending.get(analysisId) || null;
}

function consumePending(analysisId) {
  const row = getPending(analysisId);
  if (row) pending.delete(analysisId);
  return row;
}

module.exports = {
  analyzeWithoutPersist,
  getPending,
  consumePending,
  toClientResult,
  decidePresence,
};
