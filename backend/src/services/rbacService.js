/**
 * Phase 6 — Service RBAC.
 * Fournit les permissions effectives d'un administrateur, la gestion des rôles
 * et l'attribution des permissions. Source de vérité : tables user_roles /
 * role_permissions. Fallback sur admins.role si aucune ligne user_roles.
 */
const { query } = require('../config/database');
const rbac = require('../config/rbac');

/** Retourne la liste des noms de rôles d'un admin (via user_roles, fallback admins.role). */
async function getUserRoles(adminId) {
  try {
    const rows = await query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.admin_id = ?`,
      [adminId]
    );
    if (rows.length > 0) return rows.map((r) => r.name);
  } catch (_) { /* tables absentes : fallback */ }
  // Fallback : rôle hérité de la colonne admins.role.
  try {
    const a = await query('SELECT role FROM admins WHERE id = ?', [adminId]);
    if (a.length > 0) {
      const legacy = a[0].role;
      if (rbac.ROLE_PERMISSIONS[legacy]) return [legacy];
      return [rbac.LEGACY_ROLE_MAP[legacy] || 'operator'];
    }
  } catch (_) { /* ignore */ }
  return [];
}

/** Retourne l'ensemble des permissions effectives (union des rôles). */
async function getUserPermissions(adminId) {
  const roles = await getUserRoles(adminId);
  if (roles.includes(rbac.SUPER_ADMIN_ROLE)) {
    return { roles, permissions: rbac.ALL_PERMISSION_NAMES.slice(), isSuperAdmin: true };
  }
  // Essayer via la base (permissions réellement attribuées).
  try {
    const rows = await query(
      `SELECT DISTINCT p.name
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.admin_id = ?`,
      [adminId]
    );
    if (rows.length > 0) {
      return { roles, permissions: rows.map((r) => r.name), isSuperAdmin: false };
    }
  } catch (_) { /* fallback config */ }
  // Fallback : dériver de la config statique.
  const set = new Set();
  roles.forEach((role) => rbac.permissionsForRole(role).forEach((p) => set.add(p)));
  return { roles, permissions: Array.from(set), isSuperAdmin: false };
}

async function listRoles() {
  try {
    const rows = await query(
      `SELECT r.id, r.name, r.label, r.description, r.is_system,
              (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
         FROM roles r ORDER BY r.id`
    );
    for (const r of rows) {
      const perms = await query(
        `SELECT p.name FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?`,
        [r.id]
      );
      r.permissions = perms.map((p) => p.name);
    }
    return rows;
  } catch (_) {
    return rbac.ROLES.map((r) => ({ ...r, permissions: rbac.permissionsForRole(r.name) }));
  }
}

async function listPermissions() {
  try {
    const rows = await query('SELECT id, name, label, category FROM permissions ORDER BY category, name');
    if (rows.length > 0) return rows;
  } catch (_) { /* fallback */ }
  return rbac.PERMISSIONS;
}

/** Remplace les permissions d'un rôle. */
async function setRolePermissions(roleId, permissionNames) {
  const perms = await query('SELECT id, name FROM permissions');
  const idByName = {};
  perms.forEach((p) => { idByName[p.name] = p.id; });
  await query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  for (const name of permissionNames || []) {
    const pid = idByName[name];
    if (pid) {
      await query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, pid]);
    }
  }
}

/** Remplace les rôles d'un utilisateur (par noms de rôles). */
async function setUserRoles(adminId, roleNames) {
  const roles = await query('SELECT id, name FROM roles');
  const idByName = {};
  roles.forEach((r) => { idByName[r.name] = r.id; });
  await query('DELETE FROM user_roles WHERE admin_id = ?', [adminId]);
  const applied = [];
  for (const name of roleNames || []) {
    const rid = idByName[name];
    if (rid) {
      await query('INSERT IGNORE INTO user_roles (admin_id, role_id) VALUES (?, ?)', [adminId, rid]);
      applied.push(name);
    }
  }
  // Synchroniser admins.role (rôle principal) pour rétrocompatibilité JWT.
  if (applied.length > 0) {
    const primary = applied.includes('super_admin') ? 'super_admin' : applied[0];
    try {
      await query('UPDATE admins SET role = ? WHERE id = ?', [primary, adminId]);
    } catch (_) { /* colonne ENUM éventuelle */ }
  }
  return applied;
}

module.exports = {
  getUserRoles,
  getUserPermissions,
  listRoles,
  listPermissions,
  setRolePermissions,
  setUserRoles,
};
