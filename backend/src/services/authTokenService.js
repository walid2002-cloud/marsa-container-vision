/**
 * Phase 6 — Gestion des tokens (access, refresh, MFA temporaire) et
 * limitation des tentatives de connexion.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');
const rbacService = require('./rbacService');

const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || `${JWT_SECRET}_refresh`;
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const MFA_TEMP_EXPIRES_IN = '10m';

const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5;
const LOGIN_LOCK_MINUTES = parseInt(process.env.LOGIN_LOCK_MINUTES, 10) || 15;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Convertit une durée type "30d"/"8h"/"10m" en millisecondes. */
function durationToMs(str) {
  const m = /^(\d+)([smhd])$/.exec(String(str).trim());
  if (!m) return 8 * 3600 * 1000;
  const n = parseInt(m[1], 10);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * unit;
}

/** Construit le payload access token avec rôles + permissions. */
async function buildAccessToken(admin) {
  const { roles, permissions } = await rbacService.getUserPermissions(admin.id);
  const payload = {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role: admin.role,
    roles,
    permissions,
    type: 'access',
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
  return { token, roles, permissions };
}

/** Génère et stocke (haché) un refresh token. */
async function issueRefreshToken(adminId) {
  const raw = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + durationToMs(REFRESH_EXPIRES_IN));
  try {
    await query(
      'INSERT INTO refresh_tokens (admin_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [adminId, tokenHash, expiresAt]
    );
  } catch (_) { /* table absente : refresh désactivé silencieusement */ }
  return raw;
}

/** Vérifie un refresh token ; renvoie l'admin_id ou null. */
async function verifyRefreshToken(raw) {
  if (!raw) return null;
  try {
    const rows = await query(
      'SELECT id, admin_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ? LIMIT 1',
      [hashToken(raw)]
    );
    if (rows.length === 0) return null;
    const rec = rows[0];
    if (rec.revoked) return null;
    if (new Date(rec.expires_at).getTime() < Date.now()) return null;
    return { id: rec.id, adminId: rec.admin_id };
  } catch (_) {
    return null;
  }
}

async function revokeRefreshToken(raw) {
  if (!raw) return;
  try {
    await query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [hashToken(raw)]);
  } catch (_) { /* ignore */ }
}

async function revokeAllRefreshTokens(adminId) {
  try {
    await query('UPDATE refresh_tokens SET revoked = 1 WHERE admin_id = ?', [adminId]);
  } catch (_) { /* ignore */ }
}

/** Token temporaire MFA (n'ouvre pas de session, sert uniquement à valider l'OTP). */
function issueMfaToken(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, type: 'mfa' },
    JWT_SECRET,
    { expiresIn: MFA_TEMP_EXPIRES_IN }
  );
}

function verifyMfaToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'mfa') return null;
    return decoded;
  } catch (_) {
    return null;
  }
}

// ---- Limitation des tentatives de connexion ----

async function recordLoginAttempt(email, ip, success) {
  try {
    await query(
      'INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, ?)',
      [email || null, ip || null, success ? 1 : 0]
    );
  } catch (_) { /* table absente : rate-limit désactivé */ }
}

/** Vérifie si l'email/IP est temporairement bloqué. */
async function isLoginLocked(email, ip) {
  try {
    const rows = await query(
      `SELECT COUNT(*) AS n FROM login_attempts
        WHERE success = 0
          AND (email = ? OR ip_address = ?)
          AND created_at > (NOW() - INTERVAL ? MINUTE)`,
      [email || null, ip || null, LOGIN_LOCK_MINUTES]
    );
    const n = rows[0]?.n || 0;
    return { locked: n >= LOGIN_MAX_ATTEMPTS, attempts: n, max: LOGIN_MAX_ATTEMPTS };
  } catch (_) {
    return { locked: false, attempts: 0, max: LOGIN_MAX_ATTEMPTS };
  }
}

/** Réinitialise les tentatives échouées après un succès. */
async function clearLoginAttempts(email, ip) {
  try {
    await query('DELETE FROM login_attempts WHERE success = 0 AND (email = ? OR ip_address = ?)', [email || null, ip || null]);
  } catch (_) { /* ignore */ }
}

module.exports = {
  ACCESS_EXPIRES_IN,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCK_MINUTES,
  buildAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  issueMfaToken,
  verifyMfaToken,
  recordLoginAttempt,
  isLoginLocked,
  clearLoginAttempts,
};
