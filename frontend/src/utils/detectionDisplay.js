/** Libellés affichage détection (FR, jury-friendly). */

export function sourceMatchLabel(sourceMatch) {
  const map = {
    demo_index: 'Index simulation',
    ocr: 'OCR',
    yolo: 'YOLO + OCR',
    mock_registry: 'Simulation',
    none: 'Aucune correspondance',
  };
  return map[sourceMatch] || sourceMatch || 'Analyse caméras';
}

export function detectionModeLabel(mode, sourceMatch) {
  if (mode) return mode;
  if (sourceMatch === 'demo_index') return 'index';
  if (sourceMatch === 'yolo') return 'YOLO + OCR';
  if (sourceMatch === 'ocr') return 'OCR';
  return 'OCR';
}

export function sourceChannelLabel(source) {
  const map = {
    manual: 'dashboard',
    dashboard: 'dashboard',
    'whatsapp-bot': 'whatsapp-bot',
    upload: 'upload',
    camera_scan: 'live-cameras',
    'test-yolo': 'test-yolo',
  };
  return map[source] || source || 'dashboard';
}

export function resolveAiAssetUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/api/')) return path;
  const base = process.env.REACT_APP_AI_SERVICE_URL;
  if (base) return `${base.replace(/\/+$/, '')}${path}`;
  return `/ai${path}`;
}

export function yoloStatusText(yoloDetected, yoloEnabled = true) {
  if (!yoloEnabled) return 'Non (YOLO désactivé)';
  if (yoloDetected) return 'Oui (ROI utilisée avant OCR)';
  return 'Non (OCR sur image complète)';
}
