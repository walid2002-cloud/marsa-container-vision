const crypto = require('crypto');

const SECRET = process.env.CAMERA_QR_SECRET || 'marsa-camera-qr-2026';

const CAMERA_CATALOG = [
  { id: 'CAM_01', name: 'Caméra Quai Nord', zone: 'Quai Nord', active: true },
  { id: 'CAM_02', name: 'Caméra Zone de stockage', zone: 'Zone de stockage', active: true },
  { id: 'CAM_03', name: 'Caméra Entrée Port', zone: 'Entrée Port', active: true },
  { id: 'CAM_04', name: 'Caméra Sortie Port', zone: 'Sortie Port', active: true },
  { id: 'CAM_05', name: 'Caméra Inspection', zone: 'Zone inspection', active: false },
];

function qrToken(cameraId) {
  return crypto.createHmac('sha256', SECRET).update(String(cameraId)).digest('hex').slice(0, 20);
}

function withQr(cam) {
  const token = qrToken(cam.id);
  return {
    ...cam,
    qrToken: token,
    qrPayload: `marsa://camera/${cam.id}?token=${token}`,
  };
}

function listCamerasWithQr() {
  return CAMERA_CATALOG.map(withQr);
}

function getCamera(id) {
  const cam = CAMERA_CATALOG.find((c) => c.id === id);
  return cam ? withQr(cam) : null;
}

function parseCameraQr(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^marsa:\/\/camera\/(CAM_\d+)\?token=([a-f0-9]+)$/i);
  if (!match) return null;
  const id = match[1].toUpperCase();
  const token = match[2].toLowerCase();
  const cam = getCamera(id);
  if (!cam || cam.qrToken !== token) return null;
  return cam;
}

module.exports = { CAMERA_CATALOG, listCamerasWithQr, getCamera, parseCameraQr, qrToken };
