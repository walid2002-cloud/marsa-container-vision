/**
 * Phase 6 — Journal d'audit complet.
 * Écrit dans audit_logs (schéma étendu) si la table existe ; sinon no-op.
 * Ne stocke JAMAIS de secrets (masquage récursif des détails).
 */
const crypto = require('crypto');
const { pool } = require('../config/database');
const { maskSecretsDeep } = require('../utils/maskSecret');

const AUDIT_ENABLED = String(process.env.AUDIT_LOGS_ENABLED || 'true').toLowerCase() !== 'false';

let auditTableAvailable = null;

async function tableExists() {
  if (auditTableAvailable !== null) return auditTableAvailable;
  try {
    const [rows] = await pool.query("SHOW TABLES LIKE 'audit_logs'");
    auditTableAvailable = rows.length > 0;
  } catch {
    auditTableAvailable = false;
  }
  return auditTableAvailable;
}

/** Extrait les infos de requête (ip, user agent, method, path) depuis req. */
function reqInfo(req) {
  if (!req) return {};
  const ip = (req.headers?.['x-forwarded-for']?.split(',')[0]?.trim())
    || req.ip
    || req.connection?.remoteAddress
    || null;
  return {
    ip_address: ip,
    user_agent: (req.headers?.['user-agent'] || '').slice(0, 250) || null,
    method: req.method || null,
    path: (req.originalUrl || req.url || '').split('?')[0].slice(0, 250) || null,
  };
}

/**
 * Enregistre une action d'audit.
 * @param {object} p {
 *   admin, req, action, resource_type|entity, resource_id|entity_id,
 *   status, details, ip_address, user_agent, method, path
 * }
 */
async function logAction(p = {}) {
  if (!AUDIT_ENABLED) return;
  try {
    if (!(await tableExists())) return;
    const admin = p.admin || null;
    const info = { ...reqInfo(p.req), ...p };
    const actor = admin?.full_name || admin?.email || p.actor || 'system';
    const resourceType = p.resource_type || p.entity || null;
    const resourceId = p.resource_id != null ? p.resource_id
      : (p.entity_id != null ? p.entity_id : null);
    const details = p.details ? maskSecretsDeep(p.details) : null;

    await pool.query(
      `INSERT INTO audit_logs
        (audit_uuid, admin_id, actor, action, resource_type, resource_id, method, path, ip_address, user_agent, status, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        admin?.id || null,
        actor,
        p.action,
        resourceType,
        resourceId != null ? String(resourceId) : null,
        info.method || null,
        info.path || null,
        info.ip_address || null,
        info.user_agent || null,
        p.status || 'success',
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (e) {
    if (!/doesn't exist|Unknown column/i.test(e.message)) {
      console.warn('[Audit] :', e.message);
    }
  }
}

async function logSuccess(p = {}) {
  return logAction({ ...p, status: 'success' });
}

async function logFailure(p = {}) {
  return logAction({ ...p, status: 'failure' });
}

/** Rétrocompatibilité avec les anciens appels recordAudit({admin, action, entity, entity_id, details}). */
async function recordAudit(p = {}) {
  return logAction(p);
}

async function getAuditLogs(filters = {}) {
  if (!(await tableExists())) return [];
  const where = [];
  const params = [];
  if (filters.action) { where.push('action = ?'); params.push(filters.action); }
  if (filters.status) { where.push('status = ?'); params.push(filters.status); }
  if (filters.resource_type) { where.push('resource_type = ?'); params.push(filters.resource_type); }
  if (filters.admin_id) { where.push('admin_id = ?'); params.push(filters.admin_id); }
  if (filters.actor) { where.push('actor LIKE ?'); params.push(`%${filters.actor}%`); }
  if (filters.method) { where.push('method = ?'); params.push(filters.method); }
  if (filters.path) { where.push('path LIKE ?'); params.push(`%${filters.path}%`); }
  if (filters.date) { where.push('DATE(created_at) = ?'); params.push(filters.date); }
  const limit = Math.min(parseInt(filters.limit, 10) || 200, 1000);
  const sql = `SELECT id, audit_uuid, admin_id, actor, action, resource_type, resource_id,
                      method, path, ip_address, user_agent, status, details_json, created_at
                 FROM audit_logs
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY created_at DESC, id DESC
                LIMIT ${limit}`;
  const [rows] = await pool.query(sql, params);
  // Sécurité : re-masquer les détails au cas où (defense-in-depth).
  return rows.map((r) => {
    let details = null;
    if (r.details_json) {
      try {
        details = maskSecretsDeep(typeof r.details_json === 'string' ? JSON.parse(r.details_json) : r.details_json);
      } catch (_) { details = null; }
    }
    return { ...r, details_json: undefined, details };
  });
}

async function getAuditStats() {
  if (!(await tableExists())) {
    return { total: 0, success: 0, failure: 0, byAction: [], last24h: 0 };
  }
  const [totalRow] = await pool.query('SELECT COUNT(*) AS n FROM audit_logs');
  const [okRow] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE status = 'success'");
  const [failRow] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE status = 'failure'");
  const [dayRow] = await pool.query('SELECT COUNT(*) AS n FROM audit_logs WHERE created_at > (NOW() - INTERVAL 24 HOUR)');
  const [byAction] = await pool.query(
    'SELECT action, COUNT(*) AS n FROM audit_logs GROUP BY action ORDER BY n DESC LIMIT 15'
  );
  return {
    total: totalRow[0]?.n || 0,
    success: okRow[0]?.n || 0,
    failure: failRow[0]?.n || 0,
    last24h: dayRow[0]?.n || 0,
    byAction,
  };
}

module.exports = {
  logAction,
  logSuccess,
  logFailure,
  recordAudit,
  getAuditLogs,
  getAuditStats,
  reqInfo,
};
