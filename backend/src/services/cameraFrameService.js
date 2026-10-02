const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { getUploadsRoot } = require('./visionStorageService');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8001';
const DEMO_IMAGES_DIR = process.env.DEMO_IMAGES_DIR || '/app/demo_images';

/**
 * Copie une image uploadée vers demo_images et l'associe à une caméra simulée.
 */
async function attachUploadToCamera(cameraId, evidencePath, primaryCode) {
  const uploadsRoot = getUploadsRoot();
  let localFile = null;
  if (evidencePath && evidencePath.startsWith('/api/uploads/vision/')) {
    const fname = path.basename(evidencePath);
    localFile = path.join(uploadsRoot, fname);
  }
  if (!localFile || !fs.existsSync(localFile)) {
    throw new Error('Fichier upload introuvable sur le disque.');
  }

  const form = new FormData();
  form.append('file', fs.createReadStream(localFile), {
    filename: path.basename(localFile),
    contentType: 'image/png',
  });
  if (primaryCode) form.append('primary_code', primaryCode);
  form.append('source', 'upload');

  const { data } = await axios.post(
    `${AI_SERVICE_URL}/cameras/${encodeURIComponent(cameraId)}/attach-upload`,
    form,
    { headers: form.getHeaders(), maxBodyLength: 50 * 1024 * 1024, timeout: 120000 }
  );
  return data;
}

async function getCameraFrames(cameraId) {
  const { data } = await axios.get(
    `${AI_SERVICE_URL}/cameras/${encodeURIComponent(cameraId)}/frames`,
    { timeout: 15000 }
  );
  return data;
}

async function advanceCameraFrame(cameraId) {
  const { data } = await axios.post(
    `${AI_SERVICE_URL}/cameras/${encodeURIComponent(cameraId)}/next-frame`,
    {},
    { timeout: 15000 }
  );
  return data;
}

module.exports = {
  attachUploadToCamera,
  getCameraFrames,
  advanceCameraFrame,
  DEMO_IMAGES_DIR,
};
