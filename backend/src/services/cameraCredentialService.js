const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function keyBuf() {
  const raw = process.env.CAMERA_CREDENTIALS_KEY || process.env.JWT_SECRET || 'marsa-camera-credentials-dev';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBuf(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptSecret(payload) {
  if (!payload) return null;
  const [ivH, tagH, dataH] = String(payload).split(':');
  if (!ivH || !tagH || !dataH) return null;
  const decipher = crypto.createDecipheriv(ALGO, keyBuf(), Buffer.from(ivH, 'hex'));
  decipher.setAuthTag(Buffer.from(tagH, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

function maskRtspUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const probe = raw.replace(/^rtsps:/i, 'https:').replace(/^rtsp:/i, 'http:');
    const u = new URL(probe);
    const scheme = raw.toLowerCase().startsWith('rtsps') ? 'rtsps' : 'rtsp';
    const port = u.port ? `:${u.port}` : '';
    return `${scheme}://${u.hostname}${port}/****`;
  } catch {
    return 'RTSP configuré';
  }
}

function buildRtspUrl(hostUrl, username, password) {
  const raw = String(hostUrl || '').trim();
  if (!raw) return null;
  if (!username) return raw;
  const probe = raw.replace(/^rtsps:/i, 'https:').replace(/^rtsp:/i, 'http:');
  const u = new URL(probe);
  u.username = username;
  u.password = password || '';
  return u.toString().replace(/^https:/i, 'rtsps:').replace(/^http:/i, 'rtsp:');
}

module.exports = { encryptSecret, decryptSecret, maskRtspUrl, buildRtspUrl };
