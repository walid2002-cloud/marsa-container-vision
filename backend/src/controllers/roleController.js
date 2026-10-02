const { query } = require('../config/database');
const rbacService = require('../services/rbacService');
const audit = require('../services/auditService');

async function listRoles(req, res, next) {
  try {
    const roles = await rbacService.listRoles();
    return res.json({ success: true, data: roles, count: roles.length });
  } catch (err) {
    next(err);
  }
}

async function listPermissions(req, res, next) {
  try {
    const perms = await rbacService.listPermissions();
    return res.json({ success: true, data: perms, count: perms.length });
  } catch (err) {
    next(err);
  }
}

async function setRolePermissions(req, res, next) {
  try {
    const id = req.params.id;
    const rows = await query('SELECT id, name FROM roles WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Rôle introuvable.' });
    const perms = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    await rbacService.setRolePermissions(id, perms);
    await audit.logSuccess({ admin: req.admin, req, action: 'role.set_permissions', resource_type: 'role', resource_id: id, details: { role: rows[0].name, permissions: perms } });
    const updated = await rbacService.listRoles();
    return res.json({ success: true, data: updated.find((r) => Number(r.id) === Number(id)) || null });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRoles, listPermissions, setRolePermissions };
