const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'marsa_jwt_secret_2026';
const RBAC_ENABLED = String(process.env.RBAC_ENABLED || 'true').toLowerCase() !== 'false';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Accès refusé. Token manquant.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Un token temporaire MFA ne peut pas ouvrir de session.
    if (decoded.type === 'mfa') {
      return res.status(401).json({
        success: false,
        error: 'MFA requis. Token temporaire invalide pour cette ressource.',
      });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      error: 'Token invalide ou expiré.',
    });
  }
}

/**
 * Phase 6 — Middleware RBAC. Exige que l'utilisateur possède `permission`.
 * - Super Admin passe toujours.
 * - Si RBAC désactivé : bypass.
 * - Utilise les permissions embarquées dans le JWT ; fallback base de données
 *   pour les anciens tokens (rétrocompatibilité).
 */
function requirePermission(permission) {
  return async function (req, res, next) {
    try {
      if (!RBAC_ENABLED) return next();
      const admin = req.admin;
      if (!admin) {
        return res.status(401).json({ success: false, error: 'Authentification requise.' });
      }

      let roles = Array.isArray(admin.roles) ? admin.roles : null;
      let permissions = Array.isArray(admin.permissions) ? admin.permissions : null;

      // Anciens tokens sans rôles/permissions : recharger depuis la base.
      if (!permissions || !roles) {
        const rbacService = require('../services/rbacService');
        const effective = await rbacService.getUserPermissions(admin.id);
        roles = effective.roles;
        permissions = effective.permissions;
        req.admin.roles = roles;
        req.admin.permissions = permissions;
      }

      if (roles.includes('super_admin') || permissions.includes(permission)) {
        return next();
      }

      // Audit de l'accès refusé (best effort).
      try {
        const audit = require('../services/auditService');
        await audit.logFailure({
          admin,
          req,
          action: 'access.denied',
          resource_type: 'permission',
          resource_id: permission,
          details: { required: permission },
        });
      } catch (_) { /* ignore */ }

      return res.status(403).json({
        success: false,
        error: "Accès non autorisé : permission insuffisante.",
        required_permission: permission,
      });
    } catch (e) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé.' });
    }
  };
}

module.exports = { authenticateToken, requirePermission, JWT_SECRET, RBAC_ENABLED };
