export const ALERT_TYPE_LABELS = {
  IMMOBILIZED_TOO_LONG: 'Immobilisé trop longtemps',
  WRONG_ZONE: 'Mauvaise zone',
  WATCHED_CONTAINER_DETECTED: 'Conteneur surveillé détecté',
  OCR_SUSPICIOUS: 'OCR incertain',
  OLD_POSITION: 'Position ancienne',
  CAMERA_INACTIVE: 'Caméra inactive',
  AI_SERVICE_ERROR: 'Service IA en erreur',
};

export const SEVERITY_LABELS = {
  critical: 'Critique',
  warning: 'Avertissement',
  info: 'Info',
};

export const STATUS_LABELS = {
  active: 'Active',
  resolved: 'Traitée',
  ignored: 'Ignorée',
};

export function alertTypeLabel(type) {
  return ALERT_TYPE_LABELS[type] || type;
}

export function severityLabel(sev) {
  return SEVERITY_LABELS[sev] || sev;
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function formatAlertDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR');
}
