/**
 * Phase 6 — MFA (TOTP) via speakeasy + génération QR via qrcode.
 * Compatible Google Authenticator / Authy / Microsoft Authenticator.
 */
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const MFA_ISSUER = process.env.MFA_ISSUER || 'Marsa Container Vision';

/** Génère un secret MFA et l'URL otpauth + un QR code data-URL. */
async function generateSecret(email) {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${MFA_ISSUER} (${email})`,
    issuer: MFA_ISSUER,
  });
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
  } catch (_) { qrDataUrl = null; }
  return {
    base32: secret.base32,
    otpauth_url: secret.otpauth_url,
    qr_data_url: qrDataUrl,
  };
}

/** Vérifie un code TOTP contre un secret base32. */
function verifyToken(base32Secret, token) {
  if (!base32Secret || !token) return false;
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: 'base32',
    token: String(token).replace(/\s+/g, ''),
    window: 1,
  });
}

/** Génère des codes de secours (retour clair + stockage haché). */
function generateBackupCodes(count = 8) {
  const plain = [];
  const hashed = [];
  for (let i = 0; i < count; i += 1) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
    plain.push(code);
    hashed.push(crypto.createHash('sha256').update(code).digest('hex'));
  }
  return { plain, hashed };
}

/** Vérifie/consomme un code de secours. Renvoie la nouvelle liste hachée ou null. */
function consumeBackupCode(hashedList, code) {
  if (!Array.isArray(hashedList) || !code) return null;
  const h = crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
  const idx = hashedList.indexOf(h);
  if (idx === -1) return null;
  const next = hashedList.slice();
  next.splice(idx, 1);
  return next;
}

module.exports = {
  MFA_ISSUER,
  generateSecret,
  verifyToken,
  generateBackupCodes,
  consumeBackupCode,
};
