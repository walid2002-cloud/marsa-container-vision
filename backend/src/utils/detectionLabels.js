/**
 * Libellés et mapping pour source / mode de détection.
 */

function mapDetectionMode(sourceMatch, pipelineMode) {
  if (pipelineMode === 'yolo_ocr') return 'YOLO + OCR';
  if (sourceMatch === 'demo_index') return 'index';
  if (sourceMatch === 'upload') return 'upload';
  if (sourceMatch === 'stored_registry') return 'historique';
  if (sourceMatch === 'yolo') return 'YOLO + OCR';
  if (sourceMatch === 'ocr') return 'OCR';
  if (sourceMatch === 'mock_registry') return 'index';
  return 'OCR';
}

function mapSourceLabel(source) {
  const s = String(source || 'manual').toLowerCase();
  const map = {
    manual: 'dashboard',
    dashboard: 'dashboard',
    'whatsapp-bot': 'whatsapp-bot',
    upload: 'upload',
    'test-yolo': 'test-yolo',
    integration: 'whatsapp-bot',
    camera_scan: 'live-cameras',
  };
  return map[s] || source || 'dashboard';
}

function mapSourceMatchLabel(sourceMatch) {
  const map = {
    demo_index: 'Index démo',
    ocr: 'OCR',
    yolo: 'YOLO + OCR',
    mock_registry: 'Simulation',
    upload: 'Upload image',
    stored_registry: 'Historique',
    none: 'Aucune',
  };
  return map[sourceMatch] || sourceMatch || '—';
}

module.exports = {
  mapDetectionMode,
  mapSourceLabel,
  mapSourceMatchLabel,
};
