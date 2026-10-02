/**
 * Vérification des fichiers preuve IA (/results/) avant exposition.
 * Ne sert que les noms sûrs (pas de path traversal, extensions image uniquement).
 */
const axios = require('axios');
const path = require('path');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/+$/, '');
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(png|jpe?g|webp)$/i;

function filenameFromProofPath(relativeOrUrl) {
  if (!relativeOrUrl) return null;
  const p = String(relativeOrUrl).trim();
  let pathname = p;
  if (p.startsWith('http://') || p.startsWith('https://')) {
    try {
      pathname = new URL(p).pathname;
    } catch {
      return null;
    }
  }
  const base = path.basename(pathname);
  if (!base || base === '.' || base.includes('..') || !SAFE_FILENAME.test(base)) return null;
  return base;
}

function mimeFromFilename(name) {
  const ext = path.extname(name || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return null;
}

function isImageMagic(buf) {
  if (!buf || buf.length < 4) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  return false;
}

function mimeFromMagic(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Télécharge et valide un fichier preuve depuis le service IA.
 * @returns {Promise<{ ok: boolean, status: number, filename?: string, buf?: Buffer, mimeType?: string, size?: number, reason?: string }>}
 */
async function loadProofBuffer(filenameOrPath) {
  const filename = filenameFromProofPath(filenameOrPath);
  if (!filename) {
    return { ok: false, status: 400, reason: 'invalid_filename' };
  }
  const url = `${AI_SERVICE_URL}/results/${encodeURIComponent(filename)}`;
  try {
    const r = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      validateStatus: () => true,
    });
    if (r.status !== 200) {
      return { ok: false, status: r.status, filename, reason: `http_${r.status}` };
    }
    const buf = Buffer.from(r.data);
    const headerMime = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (headerMime.includes('text/html') || headerMime.includes('application/json')) {
      return { ok: false, status: 502, filename, reason: 'html_or_json_response' };
    }
    if (!buf.length) {
      return { ok: false, status: 404, filename, reason: 'empty_file' };
    }
    const magicMime = mimeFromMagic(buf);
    if (!magicMime) {
      return { ok: false, status: 502, filename, size: buf.length, reason: 'not_image_bytes' };
    }
    const nameMime = mimeFromFilename(filename);
    if (nameMime && nameMime !== magicMime) {
      return { ok: false, status: 502, filename, size: buf.length, reason: 'mime_mismatch' };
    }
    return {
      ok: true,
      status: 200,
      filename,
      buf,
      mimeType: magicMime,
      size: buf.length,
    };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      filename,
      reason: e.message,
    };
  }
}

/**
 * @returns {Promise<{ available: boolean, filename: string|null, size: number, mimeType: string|null, reason?: string }>}
 */
async function inspectProofAsset(relativeOrUrl) {
  const loaded = await loadProofBuffer(relativeOrUrl);
  if (!loaded.ok) {
    return {
      available: false,
      filename: loaded.filename || filenameFromProofPath(relativeOrUrl),
      size: loaded.size || 0,
      mimeType: null,
      reason: loaded.reason || 'unavailable',
    };
  }
  return {
    available: true,
    filename: loaded.filename,
    size: loaded.size,
    mimeType: loaded.mimeType,
  };
}

module.exports = {
  inspectProofAsset,
  loadProofBuffer,
  filenameFromProofPath,
  mimeFromFilename,
  isImageMagic,
  AI_SERVICE_URL,
};
