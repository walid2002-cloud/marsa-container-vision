/**
 * Service carte du terminal (Phase 2).
 * Agrège la config statique des zones/caméras (config/terminalMap.js) avec les
 * données de tracking de la Phase 1 (container_last_positions).
 */
const { pool } = require('../config/database');
const { ZONES, CAMERAS, resolveZoneId } = require('../config/terminalMap');
const { resolvePublicProofUrl } = require('./proofUrlService');
const { formatElapsed } = require('../utils/timeElapsed');

async function getTerminalMap({ recentLimit = 12 } = {}) {
  let rows = [];
  try {
    [rows] = await pool.query(
      `SELECT container_code, last_camera_id, last_camera_name, last_zone,
              last_confidence, last_proof_image_url, last_detected_at,
              detection_mode, movements_count
       FROM container_last_positions
       WHERE last_detected_at IS NOT NULL
       ORDER BY last_detected_at DESC
       LIMIT 300`
    );
  } catch (e) {
    console.warn('[TerminalMap] lecture positions :', e.message);
    rows = [];
  }

  const containers = rows.map((r) => {
    const elapsed = formatElapsed(r.last_detected_at);
    const zoneId = resolveZoneId(r.last_zone || r.last_camera_name || r.last_camera_id);
    return {
      container_code: r.container_code,
      zone_id: zoneId,
      zone_label: r.last_zone,
      camera_id: r.last_camera_id || (r.last_camera_name || null),
      camera_name: r.last_camera_name,
      confidence: r.last_confidence != null ? Number(r.last_confidence) : null,
      proof_image_url: r.last_proof_image_url || resolvePublicProofUrl(null),
      last_detected_at: r.last_detected_at,
      detection_mode: r.detection_mode,
      movements_count: r.movements_count,
      elapsed_since_last_detection: elapsed.text,
      elapsed_seconds: elapsed.seconds,
      needs_verification: elapsed.needs_verification,
    };
  });

  // Comptage par zone + dernier conteneur par zone.
  const countByZone = {};
  const latestByZone = {};
  for (const c of containers) {
    if (!c.zone_id) continue;
    countByZone[c.zone_id] = (countByZone[c.zone_id] || 0) + 1;
    if (!latestByZone[c.zone_id]) latestByZone[c.zone_id] = c; // rows déjà triées desc
  }

  // Phase 3 : alertes actives par zone (résolution du libellé -> zone_id).
  const alertsByZone = {};
  let totalActiveAlerts = 0;
  try {
    const [alertRows] = await pool.query(
      `SELECT zone, camera_id, COUNT(*) AS n FROM alerts
       WHERE status = 'active' GROUP BY zone, camera_id`
    );
    for (const ar of alertRows) {
      const zid = resolveZoneId(ar.zone || ar.camera_id);
      if (!zid) continue;
      alertsByZone[zid] = (alertsByZone[zid] || 0) + Number(ar.n);
      totalActiveAlerts += Number(ar.n);
    }
  } catch (e) {
    console.warn('[TerminalMap] alertes par zone :', e.message);
  }

  const zones = ZONES.map((z) => ({
    ...z,
    containers_count: countByZone[z.id] || 0,
    active_alerts_count: alertsByZone[z.id] || 0,
    last_container: latestByZone[z.id]
      ? {
          container_code: latestByZone[z.id].container_code,
          last_detected_at: latestByZone[z.id].last_detected_at,
          elapsed_since_last_detection: latestByZone[z.id].elapsed_since_last_detection,
          needs_verification: latestByZone[z.id].needs_verification,
        }
      : null,
  }));

  const cameras = CAMERAS.map((c) => ({
    ...c,
    containers_count: countByZone[c.zone_id] || 0,
    last_container: latestByZone[c.zone_id]?.container_code || null,
  }));

  const recentlyDetected = containers.slice(0, recentLimit);
  const toVerify = containers
    .filter((c) => c.needs_verification)
    .slice(0, recentLimit);

  return {
    zones,
    cameras,
    grid: { columns: 4, rows: 3 },
    recently_detected_containers: recentlyDetected,
    containers_to_verify: toVerify,
    stats: {
      total_tracked: containers.length,
      to_verify: containers.filter((c) => c.needs_verification).length,
      active_cameras: cameras.filter((c) => c.status === 'active').length,
      total_zones: zones.length,
      active_alerts: totalActiveAlerts,
    },
    generated_at: new Date().toISOString(),
  };
}

module.exports = { getTerminalMap };
