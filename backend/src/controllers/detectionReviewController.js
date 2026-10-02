const { pool } = require('../config/database');
const audit = require('../services/auditService');

async function reviewDetection(req, res, next) {
  try {
    const { detection_id: detectionId, container_code: containerCode, action, corrected_code: correctedCode, notes } = req.body || {};
    if (!containerCode || !['confirm', 'correct', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'container_code et action (confirm|correct|reject) requis.' });
    }
    if (action === 'correct' && !correctedCode) {
      return res.status(400).json({ success: false, error: 'corrected_code requis pour une correction.' });
    }

    await pool.query(
      `INSERT INTO detection_reviews (detection_id, container_code, action, corrected_code, admin_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [detectionId || null, containerCode, action, correctedCode || null, req.admin.id, notes || null]
    );

    const auditAction = action === 'confirm' ? 'DETECTION_CONFIRMED'
      : action === 'correct' ? 'OCR_CORRECTED' : 'DETECTION_REJECTED';

    if (action === 'correct' && correctedCode) {
      await pool.query(
        `UPDATE detections SET container_code = ? WHERE id = ? OR container_code = ? ORDER BY id DESC LIMIT 1`,
        [correctedCode, detectionId, containerCode]
      );
    }

    await audit.logSuccess({
      admin: req.admin,
      req,
      action: auditAction,
      resource_type: 'detection',
      resource_id: detectionId || containerCode,
      details: { action, corrected_code: correctedCode, notes },
    });

    return res.json({ success: true, data: { action, container_code: containerCode } });
  } catch (err) {
    next(err);
  }
}

module.exports = { reviewDetection };
