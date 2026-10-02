const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR =
  process.env.VISION_UPLOADS_DIR ||
  path.join(__dirname, '..', 'uploads', 'vision');

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Enregistre l'image uploadée sur disque (persistant).
 * @returns {{ filename: string, evidence_path: string, public_url: string }}
 */
function persistVisionImage(buffer, originalName, mimetype) {
  ensureUploadDir();
  const ext = path.extname(originalName || '') || (String(mimetype).includes('png') ? '.png' : '.jpg');
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '') || '.jpg';
  const filename = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  const publicUrl = `/api/uploads/vision/${filename}`;
  return {
    filename,
    fullPath,
    evidence_path: publicUrl,
    public_url: publicUrl,
  };
}

function getUploadsRoot() {
  return UPLOAD_DIR;
}

module.exports = { persistVisionImage, getUploadsRoot, ensureUploadDir };
