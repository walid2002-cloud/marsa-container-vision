const { pool } = require('../config/database');

async function getSummary(req, res, next) {
  try {
    const [tot] = await pool.query(`
      SELECT
        COUNT(*) AS total_searches,
        SUM(CASE WHEN result = 'detected' THEN 1 ELSE 0 END) AS detected_count,
        AVG(global_confidence) AS avg_global_confidence
      FROM search_history
      WHERE searched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    const [daily] = await pool.query(`
      SELECT DATE(searched_at) AS d, COUNT(*) AS cnt
      FROM search_history
      WHERE searched_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      GROUP BY DATE(searched_at)
      ORDER BY d ASC
    `);

    const [ocrTrend] = await pool.query(`
      SELECT DATE(d.detected_at) AS d, AVG(d.confidence) AS avg_ocr
      FROM detections d
      WHERE d.detected = 1 AND d.detected_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      GROUP BY DATE(d.detected_at)
      ORDER BY d ASC
    `);

    const [recent] = await pool.query(`
      SELECT id, searched_code, result, global_confidence, searched_at, source, detection_mode, camera_name, zone
      FROM search_history
      ORDER BY id DESC
      LIMIT 20
    `);

    const [recentImg] = await pool.query(`
      SELECT id, container_code, camera_name, confidence, image_path, annotated_path, detected_at, src
      FROM (
        SELECT id, container_code, camera_name, confidence, image_path, annotated_path, detected_at, 'detection' AS src
        FROM detections
        WHERE detected = 1 AND (image_path IS NOT NULL OR annotated_path IS NOT NULL)
        UNION ALL
        SELECT vu.id, vu.primary_ocr_code, 'UPLOAD', vu.ocr_avg_confidence, vu.evidence_path,
               NULL, vu.created_at, 'upload'
        FROM vision_uploads vu
        WHERE vu.evidence_path IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM detections d WHERE d.image_path = vu.evidence_path
          )
      ) recent_images
      ORDER BY detected_at DESC
      LIMIT 12
    `);

    const [uploadScans] = await pool.query(`
      SELECT COUNT(*) AS cnt FROM search_history
      WHERE source IN ('upload', 'camera_scan') AND searched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    const [yoloUsage] = await pool.query(`
      SELECT COUNT(*) AS cnt FROM search_history
      WHERE detection_mode LIKE '%YOLO%' AND searched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    // Phase 5 : répartition qualité OCR + codes partiels (best-effort, non bloquant).
    let ocrQuality = { bon: 0, moyen: 0, faible: 0, 'à vérifier': 0, partial: 0 };
    try {
      const [ocrRows] = await pool.query(`
        SELECT ocr_quality, COUNT(*) AS n
        FROM container_last_positions
        WHERE ocr_quality IS NOT NULL
        GROUP BY ocr_quality
      `);
      ocrRows.forEach((r) => {
        if (r.ocr_quality in ocrQuality) ocrQuality[r.ocr_quality] = Number(r.n);
      });
      const [partialRows] = await pool.query(`
        SELECT COUNT(*) AS n FROM container_movements
        WHERE ocr_quality IN ('faible', 'à vérifier')
          AND detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `);
      ocrQuality.partial = Number(partialRows[0]?.n) || 0;
    } catch (oe) {
      console.warn('[Analytics] OCR quality stats :', oe.message);
    }

    // Alertes OCR / IA actives (best-effort).
    let ocrAlerts = { ocr_suspicious: 0, ai_errors: 0 };
    try {
      const { getStats } = require('../services/alertService');
      const st = await getStats();
      ocrAlerts.ocr_suspicious = Number(st.by_type?.OCR_SUSPICIOUS || 0);
      ocrAlerts.ai_errors = Number(st.by_type?.AI_SERVICE_ERROR || 0);
    } catch (ae) {
      console.warn('[Analytics] OCR alert stats :', ae.message);
    }

    // Phase 7 : stats étendues pour le dashboard final (best-effort).
    let extra = {
      detectedToday: 0,
      containersToVerify: 0,
      activeAlerts: 0,
      criticalAlerts: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      lastDetectionAt: null,
    };
    try {
      const [todayRow] = await pool.query(`
        SELECT COUNT(*) AS n FROM search_history
        WHERE result = 'detected' AND DATE(searched_at) = CURDATE()
      `);
      extra.detectedToday = Number(todayRow[0]?.n) || 0;

      const staleHours = Number(process.env.STALE_POSITION_HOURS || 24);
      const [verifyRow] = await pool.query(
        `SELECT COUNT(*) AS n FROM container_last_positions
          WHERE last_detected_at IS NOT NULL
            AND last_detected_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
        [staleHours]
      );
      extra.containersToVerify = Number(verifyRow[0]?.n) || 0;

      const [lastRow] = await pool.query(
        `SELECT MAX(last_detected_at) AS m FROM container_last_positions`
      );
      extra.lastDetectionAt = lastRow[0]?.m || null;
    } catch (ee) {
      console.warn('[Analytics] extra stats :', ee.message);
    }
    try {
      const [aRow] = await pool.query(
        `SELECT
           SUM(status = 'active') AS active_cnt,
           SUM(status = 'active' AND severity = 'critical') AS crit_cnt
         FROM alerts`
      );
      extra.activeAlerts = Number(aRow[0]?.active_cnt) || 0;
      extra.criticalAlerts = Number(aRow[0]?.crit_cnt) || 0;
    } catch (ae) {
      console.warn('[Analytics] alert counts :', ae.message);
    }
    try {
      const [nRow] = await pool.query(
        `SELECT
           SUM(status = 'sent' OR status = 'simulated') AS sent_cnt,
           SUM(status = 'failed') AS failed_cnt
         FROM outbound_notifications`
      );
      extra.notificationsSent = Number(nRow[0]?.sent_cnt) || 0;
      extra.notificationsFailed = Number(nRow[0]?.failed_cnt) || 0;
    } catch (ne) {
      console.warn('[Analytics] notif counts :', ne.message);
    }

    const row = tot[0] || {};
    const total = Number(row.total_searches) || 0;
    const detected = Number(row.detected_count) || 0;
    const ocrSuccessRate = total > 0 ? detected / total : 0;
    const avgConf = row.avg_global_confidence != null ? Number(row.avg_global_confidence) : null;

    return res.json({
      success: true,
      data: {
        ocrQuality,
        ocrAlerts,
        totalSearches: total,
        detectedCount: detected,
        ocrSuccessRate,
        avgGlobalConfidence: avgConf,
        activeCameras: 4,
        imageScans: Number(uploadScans[0]?.cnt) || 0,
        yoloScans: Number(yoloUsage[0]?.cnt) || 0,
        // Phase 7 : stats étendues
        detectedToday: extra.detectedToday,
        containersToVerify: extra.containersToVerify,
        activeAlerts: extra.activeAlerts,
        criticalAlerts: extra.criticalAlerts,
        notificationsSent: extra.notificationsSent,
        notificationsFailed: extra.notificationsFailed,
        ocrToVerify: (ocrQuality.faible || 0) + (ocrQuality['à vérifier'] || 0),
        lastDetectionAt: extra.lastDetectionAt,
        detectionsPerDay: daily.map((x) => ({ date: String(x.d), count: Number(x.cnt) })),
        ocrConfidenceByDay: ocrTrend.map((x) => ({
          date: String(x.d),
          avgOcr: x.avg_ocr != null ? Number(x.avg_ocr) : 0,
        })),
        recentSearches: recent,
        recentDetectionsWithImages: recentImg,
      },
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { getSummary };
