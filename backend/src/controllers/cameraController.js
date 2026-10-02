const axios = require('axios');
const path = require('path');
const { pool, query } = require('../config/database');
const { listCamerasWithQr, parseCameraQr, getCamera: getCameraFromCatalog } = require('../config/cameraCatalog');
const { zonePatternsForCamera } = require('../utils/zoneCameraMap');
const { advanceCameraFrame, getCameraFrames, attachUploadToCamera } = require('../services/cameraFrameService');
const { recordDetection } = require('../services/containerTrackingService');
const registeredCameras = require('../services/registeredCameraService');
const { maskRtspUrl } = require('../services/cameraCredentialService');
const audit = require('../services/auditService');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

async function enrichFromDb(camId, name, zone) {
  let last = null;
  let detectionsToday = 0;
  try {
    const [rows] = await pool.query(
      `SELECT container_code AS container_code, detected, confidence, global_confidence,
              yolo_detected, detected_at, annotated_path, image_path, zone, camera_name
       FROM detections
       WHERE camera_name = ? OR zone = ?
       ORDER BY id DESC
       LIMIT 1`,
      [name || camId, zone || '']
    );
    last = rows[0] || null;
    const [cnt] = await pool.query(
      `SELECT COUNT(*) AS n FROM detections
       WHERE (camera_name = ? OR camera_name = ?) AND DATE(COALESCE(detected_at, created_at)) = CURDATE()`,
      [camId, name || camId]
    );
    detectionsToday = Number(cnt[0]?.n || 0);
  } catch {
    last = null;
  }
  return { last, detectionsToday };
}

function serializeMerged(base, extra) {
  const camId = base.id || base.camera_id;
  const last = extra.last;
  return {
    ...base,
    id: camId,
    camera_id: camId,
    name: base.name || camId,
    zone: base.zone,
    type: base.type || base.camera_type || 'rtsp',
    status: base.status || (base.active === false ? 'inactive' : 'active'),
    rtsp_configured: Boolean(base.rtsp_configured),
    rtsp_masked: base.rtsp_masked || null,
    scan_interval_seconds: base.scan_interval_seconds || null,
    last_container: last?.container_code || base.last_container || null,
    last_confidence: last?.confidence != null ? Number(last.confidence) : base.last_confidence ?? null,
    last_update: last?.detected_at || base.last_analysis_time || null,
    last_detection: last,
    thumbnail_url: extra.thumbnail || base.current_frame_url || base.upload_preview_url || null,
    detections_today: extra.detectionsToday || 0,
    snapshot_url: `/api/cameras/${encodeURIComponent(camId)}/snapshot`,
    stream_url: `/api/cameras/${encodeURIComponent(camId)}/stream`,
  };
}

async function listCameras(req, res, next) {
  const registered = await registeredCameras.listRegistered();
  let aiCameras = [];
  try {
    const { data } = await axios.get(`${AI_SERVICE_URL}/cameras`, { timeout: 15000 });
    aiCameras = data.cameras || data.data?.cameras || (Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn('[Cameras] service IA :', err.message);
  }

  const byId = new Map();
  for (const c of aiCameras) {
    const id = c.id || c.camera_id;
    if (!id) continue;
    byId.set(id, { ...c, id });
  }
  for (const r of registered) {
    const prev = byId.get(r.id) || {};
    byId.set(r.id, { ...prev, ...r, id: r.id });
  }

  const merged = [];
  for (const [id, c] of byId) {
    const extra = await enrichFromDb(id, c.name, c.zone);
    let thumbnail = c.current_frame_url || null;
    if (c.demo_image) thumbnail = `/ai/demo_images/${c.demo_image}`;
    merged.push(serializeMerged(c, { ...extra, thumbnail }));
  }

  if (merged.length === 0) {
    return res.status(502).json({
      success: false,
      error: 'Aucune caméra : service IA indisponible et aucune caméra enregistrée.',
    });
  }
  return res.json({ success: true, data: { cameras: merged } });
}

async function getCamera(req, res) {
  const id = String(req.params.id || '').toUpperCase();
  let registered = null;
  try {
    registered = await registeredCameras.getRegistered(id);
  } catch {
    registered = null;
  }
  let ai = null;
  try {
    const { data } = await axios.get(`${AI_SERVICE_URL}/cameras/${encodeURIComponent(id)}/latest`, {
      timeout: 15000,
    });
    ai = data;
  } catch {
    ai = null;
  }
  const extra = await enrichFromDb(id, registered?.name || id, registered?.zone);
  const pub = registered ? registeredCameras.publicRow(registered) : { id, name: id };
  return res.json({
    success: true,
    data: serializeMerged({ ...ai, ...pub, id }, extra),
  });
}

async function createCamera(req, res, next) {
  try {
    const row = await registeredCameras.upsertRegistered(req.body);
    await audit.logSuccess({
      admin: req.admin,
      req,
      action: 'CAMERA_CREATED',
      resource_type: 'camera',
      resource_id: row.id,
      details: { name: row.name, zone: row.zone, rtsp_configured: row.rtsp_configured },
    });
    return res.status(201).json({ success: true, data: row });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ success: false, error: e.message });
    next(e);
  }
}

async function updateCamera(req, res, next) {
  try {
    const body = { ...req.body, camera_id: req.params.id };
    const row = await registeredCameras.upsertRegistered(body);
    const action = row.active === false || row.status === 'inactive' ? 'CAMERA_DISABLED' : 'CAMERA_UPDATED';
    await audit.logSuccess({
      admin: req.admin,
      req,
      action,
      resource_type: 'camera',
      resource_id: row.id,
      details: { name: row.name, zone: row.zone, active: row.active },
    });
    return res.json({ success: true, data: row });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ success: false, error: e.message });
    next(e);
  }
}

async function deleteCamera(req, res, next) {
  try {
    const id = req.params.id;
    await registeredCameras.removeRegistered(id);
    await audit.logSuccess({
      admin: req.admin,
      req,
      action: 'CAMERA_DISABLED',
      resource_type: 'camera',
      resource_id: id,
    });
    return res.json({ success: true });
  } catch (e) {
    next(e);
  }
}

async function testCamera(req, res) {
  const id = req.params.id;
  const bodyUrl = req.body?.rtsp_url;
  const url = bodyUrl || (await registeredCameras.decryptedRtspUrl(id));
  if (!url) {
    return res.status(400).json({
      success: false,
      cameraOnline: false,
      error: 'Aucune URL RTSP configurée. Enregistrez la caméra d’abord.',
    });
  }
  try {
    const { data } = await axios.post(
      `${AI_SERVICE_URL}/cameras/rtsp/test`,
      { rtsp_url: url },
      { timeout: 20000 }
    );
    await registeredCameras.markTest(id, { ok: Boolean(data.success), error: data.error || null });
    await audit.logSuccess({
      admin: req.admin,
      req,
      action: data.success ? 'RTSP_TEST_SUCCESS' : 'RTSP_TEST_FAILED',
      resource_type: 'camera',
      resource_id: id,
      details: { latencyMs: data.latencyMs, error: data.error || null },
    });
    return res.json({
      success: Boolean(data.success),
      online: Boolean(data.cameraOnline),
      cameraOnline: Boolean(data.cameraOnline),
      snapshotUrl: data.success ? `/api/cameras/${encodeURIComponent(id)}/snapshot` : null,
      latencyMs: data.latencyMs,
      testedAt: new Date().toISOString(),
      error: data.error || null,
      rtsp_masked: data.masked_url || maskRtspUrl(url),
    });
  } catch (err) {
    const msg = err.response?.data?.detail || err.message || 'Connexion RTSP impossible';
    await registeredCameras.markTest(id, { ok: false, error: String(msg).slice(0, 250) });
    await audit.logFailure({
      admin: req.admin,
      req,
      action: 'RTSP_TEST_FAILED',
      resource_type: 'camera',
      resource_id: id,
      details: { error: String(msg).slice(0, 250) },
    });
    return res.status(502).json({
      success: false,
      cameraOnline: false,
      error: msg,
    });
  }
}

async function cameraSnapshot(req, res) {
  const id = req.params.id;
  const url = await registeredCameras.decryptedRtspUrl(id);
  try {
    if (url) {
      const r = await axios.post(
        `${AI_SERVICE_URL}/cameras/rtsp/grab`,
        { rtsp_url: url },
        { responseType: 'arraybuffer', timeout: 20000, validateStatus: () => true }
      );
      if (r.status >= 200 && r.status < 300) {
        await registeredCameras.markSnapshot(id);
        res.set('Content-Type', r.headers['content-type'] || 'image/jpeg');
        res.set('Cache-Control', 'no-store');
        return res.send(Buffer.from(r.data));
      }
    }
    const r2 = await axios.get(`${AI_SERVICE_URL}/cameras/${encodeURIComponent(id)}/live-preview`, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    res.set('Content-Type', r2.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'no-store');
    return res.send(Buffer.from(r2.data));
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: 'Aucune frame disponible (RTSP hors ligne ou simulation absente).',
    });
  }
}

async function cameraStream(req, res) {
  const id = req.params.id;
  const base = `${req.protocol}://${req.get('host')}`;
  return res.json({
    success: true,
    data: {
      mode: 'snapshot-refresh',
      url: `${base}/api/cameras/${encodeURIComponent(id)}/snapshot`,
      note: 'Le téléphone ne lit jamais rtsp://. Rafraîchir ce JPEG, ou MJPEG via le service IA.',
    },
  });
}

async function cameraDetections(req, res, next) {
  try {
    const id = req.params.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 200);
    const [rows] = await pool.query(
      `SELECT id, container_code, detected, camera_name, zone, confidence, image_path, annotated_path,
              detected_at, global_confidence, yolo_detected
       FROM detections
       WHERE camera_name = ? OR camera_name LIKE ?
       ORDER BY COALESCE(detected_at, created_at) DESC
       LIMIT ?`,
      [id, `%${id}%`, limit]
    );
    const [mov] = await pool.query(
      `SELECT id, container_code, camera_id, camera_name, zone, confidence, proof_image_url, proof_image_path,
              detected_at, source
       FROM container_movements
       WHERE camera_id = ? OR camera_name = ?
       ORDER BY detected_at DESC
       LIMIT ?`,
      [id, id, limit]
    );
    return res.json({ success: true, data: { detections: rows, movements: mov } });
  } catch (e) {
    next(e);
  }
}

async function cameraLatest(req, res, next) {
  try {
    const { id } = req.params;
    const { data } = await axios.get(`${AI_SERVICE_URL}/cameras/${encodeURIComponent(id)}/latest`, {
      timeout: 15000,
    });
    return res.json({ success: true, data });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ success: false, error: 'Caméra inconnue.' });
    }
    console.error('[Cameras] Erreur latest :', err.message);
    return res.status(502).json({
      success: false,
      error: 'Service IA indisponible.',
    });
  }
}

/**
 * Tableau de bord multi-caméras : métadonnées IA + dernière détection en base.
 */
async function camerasLiveBoard(req, res, next) {
  try {
    const { data: aiData } = await axios.get(`${AI_SERVICE_URL}/cameras/`, { timeout: 15000 });
    const cameras = aiData.cameras || [];
    const merged = [];
    for (const c of cameras) {
      const camId = c.id || c.camera_id;
      const name = c.name || c.camera_name || camId;
      let last = null;
      let uploadPreview = null;
      let uploadLast = null;
      try {
        const [rows] = await pool.query(
          `SELECT container_code AS container_code, detected, confidence, global_confidence,
                  yolo_detected, detected_at, annotated_path, image_path, zone, camera_name
           FROM detections
           WHERE camera_name = ? OR zone = ?
           ORDER BY id DESC
           LIMIT 1`,
          [name, c.zone || '']
        );
        last = rows[0] || null;

        const patterns = zonePatternsForCamera(camId);
        if (patterns.length > 0) {
          const likeClauses = patterns.map(() => '(LOWER(vu.zone) LIKE ? OR LOWER(vu.location_label) LIKE ?)').join(' OR ');
          const likeParams = patterns.flatMap((p) => [`%${p}%`, `%${p}%`]);
          const [vuRows] = await pool.query(
            `SELECT evidence_path, primary_ocr_code, zone, created_at, pipeline_mode, ocr_avg_confidence
             FROM vision_uploads vu
             WHERE ${likeClauses}
             ORDER BY vu.id DESC
             LIMIT 1`,
            likeParams
          );
          if (vuRows[0]) {
            uploadPreview = vuRows[0].evidence_path;
            uploadLast = {
              container_code: vuRows[0].primary_ocr_code,
              confidence: vuRows[0].ocr_avg_confidence,
              detected_at: vuRows[0].created_at,
              source: 'upload',
            };
            if (!last || new Date(vuRows[0].created_at) > new Date(last.detected_at || 0)) {
              last = {
                container_code: vuRows[0].primary_ocr_code,
                detected: 1,
                confidence: vuRows[0].ocr_avg_confidence,
                yolo_detected: 0,
                detected_at: vuRows[0].created_at,
                image_path: vuRows[0].evidence_path,
                zone: vuRows[0].zone,
                source: 'upload',
              };
            }
          }
        }
      } catch {
        last = null;
      }
      merged.push({
        ...c,
        camera_id: camId,
        last_detection: last,
        upload_preview_url: uploadPreview,
        upload_last: uploadLast,
        last_analysis_time: c.last_analysis_time || null,
      });
    }
    return res.json({ success: true, data: merged });
  } catch (err) {
    console.error('[Cameras] live-board :', err.message);
    return res.status(502).json({
      success: false,
      error: 'Impossible de construire le tableau caméras.',
    });
  }
}

async function analyzeCamera(req, res, next) {
  try {
    const { id } = req.params;
    const { data } = await axios.post(
      `${AI_SERVICE_URL}/cameras/${encodeURIComponent(id)}/analyze`,
      {},
      { timeout: 120000 }
    );
    if (data && data.last_container) {
      try {
        await pool.query(
          `INSERT INTO detections (
             container_code, detected, camera_name, zone, confidence, image_path, detected_at,
             global_confidence, yolo_confidence, yolo_detected, annotated_path
           ) VALUES (?, 1, ?, ?, ?, ?, NOW(), ?, NULL, ?, NULL)`,
          [
            data.last_container,
            data.camera_name,
            data.zone,
            data.confidence || 0,
            data.image_url,
            data.confidence,
            data.yolo_detected ? 1 : 0,
          ]
        );
        await recordDetection({
          containerCode: data.last_container,
          cameraId: data.camera_id || id,
          cameraName: data.camera_name,
          zone: data.zone,
          confidence: data.confidence,
          proofImagePath: data.image_url,
          detectedAt: data.analyzed_at || new Date(),
          source: 'camera_scan',
          detectionMode: data.yolo_detected ? 'YOLO + OCR' : 'OCR',
          orientation: data.orientation || null,
          ocrQuality: data.ocr_quality || null,
          partialCodeDetected: data.partial_code_detected || false,
          rawOcrText: data.raw_ocr_text || null,
        });
      } catch (tErr) {
        console.warn('[Tracking] analyze :', tErr.message);
      }
    }
    // Phase 5 : alerte OCR_SUSPICIOUS si lecture caméra douteuse / code partiel.
    try {
      if (data && (data.ocr_quality || data.partial_code_detected)) {
        await require('../services/alertService').reportOcrQuality({
          container_code: data.last_container || null,
          zone: data.zone || null,
          camera_id: data.camera_id || id,
          camera_name: data.camera_name || null,
          proof_image_url: data.image_url || null,
          ocr_quality: data.ocr_quality || null,
          partial_code_detected: data.partial_code_detected || false,
          raw_ocr_text: data.raw_ocr_text || null,
          source: 'camera_scan',
          source_context: `camera:${id}`,
        });
      }
    } catch (oErr) {
      console.warn('[Cameras][OCR alert]', oErr.message);
    }
    return res.json({ success: true, data });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ success: false, error: 'Caméra inconnue ou image indisponible.' });
    }
    console.error('[Cameras] analyze :', err.message);
    try { require('../services/alertService').reportAiError('camera_analyze', err); } catch { /* noop */ }
    return res.status(502).json({ success: false, error: 'Analyse caméra impossible.' });
  }
}

async function scanAllCameras(req, res, next) {
  try {
    const { data } = await axios.post(`${AI_SERVICE_URL}/cameras/scan-all`, {}, { timeout: 180000 });
    const adminId = req.admin?.id || null;
    try {
      for (const row of data.results || []) {
        if (row.last_container) {
          await pool.query(
            `INSERT INTO detections (
               container_code, detected, camera_name, zone, confidence, image_path, detected_at,
               global_confidence, yolo_confidence, yolo_detected, annotated_path
             ) VALUES (?, 1, ?, ?, ?, ?, NOW(), ?, ?, ?, NULL)`,
            [
              row.last_container,
              row.camera_name,
              row.zone,
              row.confidence || 0,
              row.image_url,
              row.confidence,
              row.yolo_confidence,
              row.yolo_detected ? 1 : 0,
            ]
          );
          try {
            await recordDetection({
              containerCode: row.last_container,
              cameraId: row.camera_id || null,
              cameraName: row.camera_name,
              zone: row.zone,
              confidence: row.confidence,
              proofImagePath: row.image_url,
              detectedAt: row.analyzed_at || new Date(),
              source: 'camera_scan',
              detectionMode: row.yolo_detected ? 'YOLO + OCR' : 'OCR',
              orientation: null,
              ocrQuality: null,
            });
          } catch (tErr) {
            console.warn('[Tracking] scan-all :', tErr.message);
          }
        }
      }
      await pool.query(
        `INSERT INTO search_history (searched_code, result, admin_id, source, detection_mode)
         VALUES ('SCAN_ALL', 'detected', ?, 'camera_scan', 'OCR')`,
        [adminId]
      );
    } catch (dbErr) {
      console.warn('[Cameras] scan-all DB :', dbErr.message);
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[Cameras] scan-all :', err.message);
    try { require('../services/alertService').reportAiError('camera_scan_all', err); } catch { /* noop */ }
    return res.status(502).json({ success: false, error: 'Scan global des caméras impossible.' });
  }
}

async function cameraFrames(req, res, next) {
  try {
    const data = await getCameraFrames(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ success: false, error: 'Caméra inconnue.' });
    }
    return res.status(502).json({ success: false, error: 'Impossible de charger les frames.' });
  }
}

async function cameraNextFrame(req, res, next) {
  try {
    const data = await advanceCameraFrame(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ success: false, error: 'Aucune frame pour cette caméra.' });
    }
    return res.status(502).json({ success: false, error: 'Impossible de changer de frame.' });
  }
}

async function attachFrameToCamera(req, res, next) {
  try {
    const { camera_id: cameraId, evidence_path: evidencePath, primary_code: primaryCode } = req.body;
    if (!cameraId || !evidencePath) {
      return res.status(400).json({ success: false, error: 'camera_id et evidence_path requis.' });
    }
    const data = await attachUploadToCamera(cameraId, evidencePath, primaryCode);
    try {
      await pool.query(
        `INSERT INTO camera_frames (camera_id, source_type, filename, image_path, primary_code)
         VALUES (?, 'upload', ?, ?, ?)`,
        [cameraId, data.filename || path.basename(evidencePath), data.image_url || data.frame?.url, primaryCode || null]
      );
    } catch (dbErr) {
      console.warn('[Cameras] camera_frames insert :', dbErr.message);
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[Cameras] attach-frame :', err.message);
    return res.status(502).json({ success: false, error: err.message || 'Association caméra impossible.' });
  }
}

async function pairCamera(req, res) {
  const cam = parseCameraQr(req.body.qr || req.body.payload || '');
  if (!cam) {
    return res.status(400).json({ success: false, error: 'QR caméra invalide.' });
  }
  if (!cam.active) {
    return res.status(400).json({ success: false, error: 'Cette caméra est inactive.' });
  }
  return res.json({ success: true, data: cam });
}

async function listCameraQrCatalog(req, res) {
  return res.json({ success: true, data: listCamerasWithQr() });
}

async function startInspectionSession(req, res) {
  const cameraId = req.body.cameraId || req.body.camera_id;
  const token = req.body.token;
  const cam = getCameraFromCatalog(cameraId);
  if (!cam || (token && token !== cam.qrToken)) {
    return res.status(400).json({ success: false, error: 'Caméra ou token invalide.' });
  }
  try {
    const result = await query(
      `INSERT INTO camera_inspection_sessions (camera_id, admin_id, started_at, scans_count)
       VALUES (?, ?, NOW(), 0)`,
      [cam.id, req.admin?.id || null]
    );
    return res.json({
      success: true,
      data: {
        id: result.insertId,
        cameraId: cam.id,
        zone: cam.zone,
        name: cam.name,
        startedAt: new Date().toISOString(),
        scansCount: 0,
      },
    });
  } catch (e) {
    return res.json({
      success: true,
      data: {
        id: Date.now(),
        cameraId: cam.id,
        zone: cam.zone,
        name: cam.name,
        startedAt: new Date().toISOString(),
        scansCount: 0,
      },
    });
  }
}

async function endInspectionSession(req, res) {
  try {
    await query(
      `UPDATE camera_inspection_sessions SET ended_at = NOW() WHERE id = ?`,
      [req.params.id]
    );
  } catch (_) { /* optional */ }
  return res.json({ success: true });
}

module.exports = {
  listCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  testCamera,
  cameraSnapshot,
  cameraStream,
  cameraDetections,
  cameraLatest,
  camerasLiveBoard,
  analyzeCamera,
  scanAllCameras,
  cameraFrames,
  cameraNextFrame,
  attachFrameToCamera,
  pairCamera,
  listCameraQrCatalog,
  startInspectionSession,
  endInspectionSession,
};
