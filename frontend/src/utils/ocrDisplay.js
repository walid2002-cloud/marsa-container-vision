// Phase 5 — Helpers d'affichage OCR / YOLO côté frontend.

export const OCR_QUALITY_META = {
  bon: { label: 'Bon', cls: 'ocrq-good', icon: '\u2705' },
  moyen: { label: 'Moyen', cls: 'ocrq-medium', icon: '\u26A0\uFE0F' },
  faible: { label: 'Faible', cls: 'ocrq-low', icon: '\u26A0\uFE0F' },
  'à vérifier': { label: 'À vérifier', cls: 'ocrq-unsure', icon: '\uD83D\uDD0D' },
};

export function ocrQualityMeta(quality) {
  if (!quality) return null;
  return OCR_QUALITY_META[quality] || { label: quality, cls: 'ocrq-medium', icon: '\u2139\uFE0F' };
}

export function matchTypeLabel(type) {
  switch (type) {
    case 'exact':
      return 'Exact';
    case 'fuzzy':
      return 'Approché (fuzzy)';
    case 'alias':
      return 'Alias';
    case 'none':
    default:
      return 'Aucun';
  }
}

const ORIENTATION_LABELS = {
  front: 'Face avant',
  back: 'Face arrière',
  left_side: 'Côté gauche',
  right_side: 'Côté droit',
  angled: 'En biais',
  unknown: 'Inconnue',
};

export function orientationLabel(o) {
  return ORIENTATION_LABELS[o] || 'Inconnue';
}

const YOLO_MODE_META = {
  disabled: { label: 'Désactivé', cls: 'yolo-mode-off' },
  experimental: { label: 'Expérimental (COCO)', cls: 'yolo-mode-exp' },
  custom: { label: 'Custom conteneurs', cls: 'yolo-mode-custom' },
  unavailable: { label: 'Indisponible (fallback)', cls: 'yolo-mode-unavailable' },
};

export function yoloModeMeta(mode) {
  if (!mode) return null;
  return YOLO_MODE_META[mode] || { label: mode, cls: 'yolo-mode-exp' };
}

export function yoloModeWarning(mode) {
  if (mode === 'experimental') {
    return 'YOLO utilise un modèle COCO générique (yolov8n), non spécialisé conteneurs.';
  }
  if (mode === 'unavailable') {
    return 'Modèle YOLO custom demandé mais introuvable : repli sur OCR seul.';
  }
  return null;
}

export function formatScore(score) {
  if (score == null || Number.isNaN(Number(score))) return null;
  return `${Math.round(Number(score) * 100)}%`;
}
