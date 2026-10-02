/**
 * Types, gravités et seuils des alertes intelligentes (Phase 3).
 */

const SEVERITY = { INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' };
const STATUS = { ACTIVE: 'active', RESOLVED: 'resolved', IGNORED: 'ignored' };

const ALERT_TYPES = {
  IMMOBILIZED_TOO_LONG: {
    type: 'IMMOBILIZED_TOO_LONG',
    severity: SEVERITY.WARNING,
    label: 'Conteneur immobilisé trop longtemps',
  },
  WRONG_ZONE: {
    type: 'WRONG_ZONE',
    severity: SEVERITY.CRITICAL,
    label: 'Conteneur dans une mauvaise zone',
  },
  WATCHED_CONTAINER_DETECTED: {
    type: 'WATCHED_CONTAINER_DETECTED',
    severity: SEVERITY.CRITICAL,
    label: 'Conteneur surveillé détecté',
  },
  OCR_SUSPICIOUS: {
    type: 'OCR_SUSPICIOUS',
    severity: SEVERITY.WARNING,
    label: 'Lecture OCR incertaine',
  },
  OLD_POSITION: {
    type: 'OLD_POSITION',
    severity: SEVERITY.WARNING,
    label: 'Dernière position trop ancienne',
  },
  CAMERA_INACTIVE: {
    type: 'CAMERA_INACTIVE',
    severity: SEVERITY.WARNING,
    label: 'Caméra inactive',
  },
  AI_SERVICE_ERROR: {
    type: 'AI_SERVICE_ERROR',
    severity: SEVERITY.CRITICAL,
    label: 'Service IA en erreur',
  },
};

const THRESHOLDS = {
  STALE_POSITION_HOURS: Number(process.env.STALE_POSITION_HOURS || 24),
  IMMOBILIZED_HOURS: Number(process.env.IMMOBILIZED_HOURS || 2),
  OCR_SUSPICIOUS_QUALITIES: ['faible', 'à vérifier'],
};

module.exports = { SEVERITY, STATUS, ALERT_TYPES, THRESHOLDS };
