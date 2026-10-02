const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const rbacService = require('../services/rbacService');
const tokenService = require('../services/authTokenService');
const audit = require('../services/auditService');
const rbac = require('../config/rbac');
const passwordPolicy = require('../services/passwordPolicyService');

/** Nettoie un enregistrement admin (aucun secret exposé). */
function sanitize(row, roles = []) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    roles,
    is_active: row.is_active === undefined ? true : !!row.is_active,
    mfa_enabled: !!row.mfa_enabled,
    created_at: row.created_at,
  };
}

async function listUsers(req, res, next) {
  try {
    const rows = await query(
      'SELECT id, full_name, email, role, is_active, mfa_enabled, created_at FROM admins ORDER BY id'
    );
    const data = [];
    for (const r of rows) {
      const roles = await rbacService.getUserRoles(r.id);
      data.push(sanitize(r, roles));
    }
    return res.json({ success: true, data, count: data.length });
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    const rows = await query(
      'SELECT id, full_name, email, role, is_active, mfa_enabled, created_at FROM admins WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    const { roles, permissions } = await rbacService.getUserPermissions(rows[0].id);
    const data = sanitize(rows[0], roles);
    data.permissions = permissions;
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { full_name, email, password, roles } = req.body || {};
    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, error: 'full_name, email et password requis.' });
    }
    const pwdCheck = passwordPolicy.validatePassword(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, error: pwdCheck.errors.join(' ') });
    }
    const existing = await query('SELECT id FROM admins WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Un utilisateur avec cet email existe déjà.' });
    }
    const validRoles = (Array.isArray(roles) ? roles : []).filter((r) => rbac.ROLE_PERMISSIONS[r] || r === 'super_admin');
    const primaryRole = validRoles.includes('super_admin') ? 'super_admin' : (validRoles[0] || 'reader');
    const hash = await bcrypt.hash(password, 10);
    const expiresAt = passwordPolicy.computeExpiry();
    const result = await query(
      `INSERT INTO admins (full_name, email, password_hash, role, is_active, created_by,
       password_changed_at, password_expires_at)
       VALUES (?, ?, ?, ?, 1, ?, NOW(), ?)`,
      [full_name, email, hash, primaryRole, req.admin?.id || null, expiresAt]
    );
    const newId = result.insertId;
    await rbacService.setUserRoles(newId, validRoles.length ? validRoles : [primaryRole]);
    await audit.logSuccess({ admin: req.admin, req, action: 'user.create', resource_type: 'user', resource_id: newId, details: { email, roles: validRoles } });
    const rows = await query('SELECT id, full_name, email, role, is_active, mfa_enabled, created_at FROM admins WHERE id = ?', [newId]);
    const rolesOut = await rbacService.getUserRoles(newId);
    return res.status(201).json({ success: true, data: sanitize(rows[0], rolesOut) });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const id = req.params.id;
    const rows = await query('SELECT * FROM admins WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    const { full_name, email, is_active, password } = req.body || {};
    const sets = [];
    const params = [];
    if (full_name !== undefined) { sets.push('full_name = ?'); params.push(full_name); }
    if (email !== undefined) { sets.push('email = ?'); params.push(email); }
    if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (password) { sets.push('password_hash = ?'); params.push(await bcrypt.hash(password, 10)); }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun champ à mettre à jour.' });
    }
    params.push(id);
    await query(`UPDATE admins SET ${sets.join(', ')} WHERE id = ?`, params);
    if (is_active === false || password) {
      await tokenService.revokeAllRefreshTokens(id);
    }
    await audit.logSuccess({ admin: req.admin, req, action: 'user.update', resource_type: 'user', resource_id: id, details: { fields: Object.keys(req.body || {}) } });
    const out = await query('SELECT id, full_name, email, role, is_active, mfa_enabled, created_at FROM admins WHERE id = ?', [id]);
    const rolesOut = await rbacService.getUserRoles(id);
    return res.json({ success: true, data: sanitize(out[0], rolesOut) });
  } catch (err) {
    next(err);
  }
}

/** Désactivation (soft delete) — on ne supprime jamais physiquement pour l'audit. */
async function deleteUser(req, res, next) {
  try {
    const id = req.params.id;
    const rows = await query('SELECT id, is_active FROM admins WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    if (Number(id) === Number(req.admin?.id)) {
      return res.status(400).json({ success: false, error: 'Impossible de désactiver votre propre compte.' });
    }
    await query('UPDATE admins SET is_active = 0 WHERE id = ?', [id]);
    await tokenService.revokeAllRefreshTokens(id);
    await audit.logSuccess({ admin: req.admin, req, action: 'user.deactivate', resource_type: 'user', resource_id: id });
    return res.json({ success: true, data: { id: Number(id), is_active: false } });
  } catch (err) {
    next(err);
  }
}

async function setRoles(req, res, next) {
  try {
    const id = req.params.id;
    const rows = await query('SELECT id FROM admins WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    const roleNames = Array.isArray(req.body?.roles) ? req.body.roles : [];
    const applied = await rbacService.setUserRoles(id, roleNames);
    await tokenService.revokeAllRefreshTokens(id); // forcer un nouveau token avec les nouvelles permissions
    await audit.logSuccess({ admin: req.admin, req, action: 'user.set_roles', resource_type: 'user', resource_id: id, details: { roles: applied } });
    return res.json({ success: true, data: { id: Number(id), roles: applied } });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser, setRoles };
