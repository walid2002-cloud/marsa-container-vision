/**
 * Associe un libellé saisi (ex. "zone C") à une caméra simulée.
 */
const ZONE_CAMERA_MAP = [
  { patterns: ['zone a', 'quai nord', 'cam_01', 'cam01'], id: 'CAM_01', zone: 'Zone A - Quai Nord' },
  { patterns: ['zone b', 'stockage', 'cam_02', 'cam02'], id: 'CAM_02', zone: 'Zone B - Stockage' },
  { patterns: ['zone c', 'entrée port', 'entree port', 'cam_03', 'cam03'], id: 'CAM_03', zone: 'Zone C - Entrée Port' },
  { patterns: ['zone d', 'sortie port', 'cam_04', 'cam04'], id: 'CAM_04', zone: 'Zone D - Sortie Port' },
];

function resolveCameraFromLocation(locationLabel) {
  const raw = String(locationLabel || '').trim();
  const z = raw.toLowerCase();
  if (!z) {
    return { camera_id: 'UPLOAD', camera_name: 'UPLOAD', zone: 'Upload manuel — hors caméra simulée' };
  }
  for (const entry of ZONE_CAMERA_MAP) {
    if (entry.id.toLowerCase() === z || entry.patterns.some((p) => z.includes(p))) {
      return {
        camera_id: entry.id,
        camera_name: entry.id,
        zone: entry.zone,
        location_label: raw,
      };
    }
  }
  return {
    camera_id: 'UPLOAD',
    camera_name: 'UPLOAD',
    zone: raw,
    location_label: raw,
  };
}

function zonePatternsForCamera(cameraId) {
  const entry = ZONE_CAMERA_MAP.find((e) => e.id === cameraId);
  return entry ? entry.patterns : [];
}

module.exports = { resolveCameraFromLocation, zonePatternsForCamera, ZONE_CAMERA_MAP };
