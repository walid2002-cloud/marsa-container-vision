const {
  getLastPosition,
  getMovements,
} = require('../services/containerTrackingService');
const { getTerminalMap } = require('../services/terminalMapService');
const { getActiveAlertsForContainer } = require('../services/alertService');
const visualProofService = require('../services/visualProofService');
const { resolveZoneId, ZONES } = require('../config/terminalMap');
const { dashboardUrl, mapUrl } = require('../utils/publicUrl');
const audit = require('../services/auditService');

async function getContainerPosition(req, res, next) {
  try {
    const { code } = req.params;
    const position = await getLastPosition(code);
    if (!position) {
      return res.status(404).json({
        success: false,
        error: 'Aucune position connue pour ce conteneur.',
      });
    }
    return res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

async function getContainerMovements(req, res, next) {
  try {
    const { code } = req.params;
    const limit = req.query.limit;
    const movements = await getMovements(code, limit);
    const position = await getLastPosition(code);
    return res.json({
      success: true,
      data: {
        container_code: code,
        last_position: position,
        movements,
        count: movements.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function terminalMap(req, res, next) {
  try {
    const recentLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const data = await getTerminalMap({ recentLimit });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Phase 7 — Rapport conteneur (résumé JSON exportable).
 * GET /api/containers/:code/report
 */
async function getContainerReport(req, res, next) {
  try {
    const { code } = req.params;
    const [position, movements, alerts, proofs] = await Promise.all([
      getLastPosition(code),
      getMovements(code, 50),
      getActiveAlertsForContainer(code),
      visualProofService.getProofsForContainer(code, 20),
    ]);

    const zoneLabel = position?.last_zone || null;
    const zoneId = zoneLabel ? resolveZoneId(zoneLabel) : null;
    const zoneMeta = zoneId ? ZONES.find((z) => z.id === zoneId) : null;

    const report = {
      container_code: String(code).trim().toUpperCase(),
      generated_at: new Date().toISOString(),
      has_known_position: Boolean(position && position.last_detected_at),
      last_position: position,
      tracking: {
        movements_count: movements.length,
        movements,
      },
      ocr: {
        quality: position?.ocr_quality || null,
      },
      yolo: {
        orientation: position?.orientation || 'unknown',
      },
      alerts,
      proofs,
      proof: proofs[0]
        ? {
            originalUrl: proofs[0].originalUrl || proofs[0].image_url,
            annotatedUrl: proofs[0].annotatedUrl || proofs[0].image_url,
          }
        : null,
      links: {
        dashboard_url: dashboardUrl(code),
        map_url: mapUrl({
          zone: zoneMeta?.zone_label || zoneLabel || undefined,
          camera: position?.last_camera_id || zoneMeta?.camera_id || undefined,
          code,
        }),
      },
    };

    try {
      await audit.logSuccess({ admin: req.admin, req, action: 'container.report', resource_type: 'container', resource_id: code });
    } catch (_) { /* best effort */ }

    return res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}

const { pool } = require('../config/database');

async function watchContainer(req, res, next) {
  try {
    const code = String(req.params.code || '').toUpperCase();
    await pool.query(
      `INSERT IGNORE INTO watched_containers (container_code, admin_id) VALUES (?, ?)`,
      [code, req.admin?.id || null]
    );
    return res.json({ success: true, watched: true, container_code: code });
  } catch (err) {
    next(err);
  }
}

async function unwatchContainer(req, res, next) {
  try {
    const code = String(req.params.code || '').toUpperCase();
    await pool.query(`DELETE FROM watched_containers WHERE container_code = ?`, [code]);
    return res.json({ success: true, watched: false, container_code: code });
  } catch (err) {
    next(err);
  }
}

async function listWatched(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT container_code, created_at FROM watched_containers ORDER BY id DESC LIMIT 100`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getContainerPosition,
  getContainerMovements,
  terminalMap,
  getContainerReport,
  watchContainer,
  unwatchContainer,
  listWatched,
};
