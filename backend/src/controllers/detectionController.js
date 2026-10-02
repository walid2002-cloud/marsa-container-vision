const { query } = require('../config/database');

async function getDetections(req, res, next) {
  try {
    const camera = String(req.query.camera || req.query.camera_id || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    let rows;
    if (camera) {
      rows = await query(
        `SELECT * FROM detections
         WHERE camera_name = ? OR zone LIKE ?
         ORDER BY COALESCE(detected_at, created_at) DESC
         LIMIT ?`,
        [camera, `%${camera}%`, limit]
      );
    } else {
      rows = await query(
        'SELECT * FROM detections ORDER BY COALESCE(detected_at, created_at) DESC LIMIT ?',
        [limit]
      );
    }
    return res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function getDetectionById(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM detections WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Détection introuvable.',
      });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
}

async function getSearchHistory(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const rows = await query(
      `SELECT sh.id, sh.searched_code, sh.result, sh.searched_at,
              COALESCE(sh.source, 'manual') AS source,
              sh.global_confidence,
              sh.evidence_path,
              sh.detection_mode,
              sh.source_match,
              COALESCE(sh.camera_name, d.camera_name) AS camera_name,
              COALESCE(sh.zone, d.zone) AS zone,
              COALESCE(sh.confidence, d.confidence) AS confidence,
              a.full_name AS admin_name
       FROM search_history sh
       LEFT JOIN detections d ON sh.detection_id = d.id
       LEFT JOIN admins a ON sh.admin_id = a.id
       ORDER BY sh.searched_at DESC
       LIMIT ?`,
      [limit]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

module.exports = { getDetections, getDetectionById, getSearchHistory };
