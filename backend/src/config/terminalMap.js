/**
 * Configuration schématique du terminal portuaire (Phase 2).
 * Source unique de vérité pour la carte : zones + caméras.
 * Aligné sur zoneCameraMap.js et demo_cameras.json (Phase 1).
 *
 * `grid` : placement dans une grille 4 colonnes x 3 lignes (carte schématique).
 * `aliases` : mots-clés pour retrouver la zone à partir d'une chaîne libre
 *             (ex. "Zone C - Entrée Port" -> zone entree_port).
 */

const ZONES = [
  {
    id: 'quai_nord',
    name: 'Quai Nord',
    zone_label: 'Zone A - Quai Nord',
    camera_id: 'CAM_01',
    accent: '#2563eb',
    grid: { col: 1, row: 1, colSpan: 4, rowSpan: 1 },
    aliases: ['quai nord', 'zone a', 'cam_01', 'cam01'],
  },
  {
    id: 'entree_port',
    name: 'Entrée Port',
    zone_label: 'Zone C - Entrée Port',
    camera_id: 'CAM_03',
    accent: '#16a34a',
    grid: { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
    aliases: ['entrée port', 'entree port', 'zone c', 'cam_03', 'cam03'],
  },
  {
    id: 'stockage',
    name: 'Zone de stockage',
    zone_label: 'Zone B - Stockage',
    camera_id: 'CAM_02',
    accent: '#7c3aed',
    grid: { col: 2, row: 2, colSpan: 2, rowSpan: 1 },
    aliases: ['stockage', 'zone b', 'cam_02', 'cam02'],
  },
  {
    id: 'sortie_port',
    name: 'Sortie Port',
    zone_label: 'Zone D - Sortie Port',
    camera_id: 'CAM_04',
    accent: '#ea580c',
    grid: { col: 4, row: 2, colSpan: 1, rowSpan: 1 },
    aliases: ['sortie port', 'zone d', 'cam_04', 'cam04'],
  },
  {
    id: 'inspection',
    name: 'Zone inspection',
    zone_label: 'Zone E - Inspection',
    camera_id: 'CAM_05',
    accent: '#0891b2',
    grid: { col: 1, row: 3, colSpan: 2, rowSpan: 1 },
    aliases: ['inspection', 'zone e', 'cam_05', 'cam05', 'transitoire'],
  },
  {
    id: 'chargement',
    name: 'Zone chargement',
    zone_label: 'Zone F - Chargement',
    camera_id: null,
    accent: '#db2777',
    grid: { col: 3, row: 3, colSpan: 2, rowSpan: 1 },
    aliases: ['chargement', 'zone f', 'loading'],
  },
];

const CAMERAS = [
  { id: 'CAM_01', name: 'CAM_01', zone_id: 'quai_nord', zone_label: 'Zone A - Quai Nord', status: 'active' },
  { id: 'CAM_02', name: 'CAM_02', zone_id: 'stockage', zone_label: 'Zone B - Stockage', status: 'active' },
  { id: 'CAM_03', name: 'CAM_03', zone_id: 'entree_port', zone_label: 'Zone C - Entrée Port', status: 'active' },
  { id: 'CAM_04', name: 'CAM_04', zone_id: 'sortie_port', zone_label: 'Zone D - Sortie Port', status: 'active' },
  { id: 'CAM_05', name: 'CAM_05', zone_id: 'inspection', zone_label: 'Zone E - Inspection', status: 'inactive' },
];

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Retrouve l'id de zone à partir d'une chaîne libre (zone ou caméra).
 * @param {string} zoneOrCamera
 * @returns {string|null}
 */
function resolveZoneId(zoneOrCamera) {
  const z = normalize(zoneOrCamera);
  if (!z) return null;

  // Caméra explicite ?
  const cam = CAMERAS.find((c) => normalize(c.id) === z || normalize(c.name) === z);
  if (cam) return cam.zone_id;

  for (const zone of ZONES) {
    if (normalize(zone.id) === z) return zone.id;
    if (zone.aliases.some((a) => z.includes(normalize(a)))) return zone.id;
  }
  return null;
}

module.exports = { ZONES, CAMERAS, resolveZoneId, normalize };
