/**
 * Règles de routage des notifications par type d'alerte et par gravité (Phase 4).
 * Retourne l'ensemble des canaux à notifier (union type + gravité).
 * "dashboard only" = aucun canal externe (l'alerte reste visible dans l'app).
 */

const TYPE_CHANNELS = {
  WATCHED_CONTAINER_DETECTED: ['whatsapp'],
  WRONG_ZONE: ['whatsapp', 'email'],
  IMMOBILIZED_TOO_LONG: ['email'],
  OCR_SUSPICIOUS: ['email'],       // seulement si warning/critical (géré ci-dessous)
  OLD_POSITION: ['email'],         // seulement si warning/critical (géré ci-dessous)
  CAMERA_INACTIVE: ['email'],
  AI_SERVICE_ERROR: ['email'],
};

const SEVERITY_CHANNELS = {
  critical: ['whatsapp', 'email'],
  warning: ['email'],
  info: [],
};

// Types envoyés uniquement au dashboard tant que la gravité reste "info".
const DASHBOARD_ONLY_IF_INFO = new Set(['OCR_SUSPICIOUS', 'OLD_POSITION']);

/**
 * @param {string} type
 * @param {string} severity
 * @returns {string[]} canaux uniques
 */
function channelsForAlert(type, severity) {
  if (severity === 'info' && DASHBOARD_ONLY_IF_INFO.has(type)) {
    return [];
  }
  const set = new Set();
  (TYPE_CHANNELS[type] || []).forEach((c) => set.add(c));
  (SEVERITY_CHANNELS[severity] || []).forEach((c) => set.add(c));
  return Array.from(set);
}

module.exports = { channelsForAlert, TYPE_CHANNELS, SEVERITY_CHANNELS };
