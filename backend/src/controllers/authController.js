const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const rbacService = require('../services/rbacService');
const tokenService = require('../services/authTokenService');
const mfaService = require('../services/mfaService');
const audit = require('../services/auditService');
const passwordPolicy = require('../services/passwordPolicyService');

function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim())
    || req.ip
    || req.connection?.remoteAddress
    || null;
}

async function publicProfile(admin) {
  const { roles, permissions, isSuperAdmin } = await rbacService.getUserPermissions(admin.id);
  const pwd = passwordPolicy.passwordStatus(admin);
  const primaryRole = roles.includes('super_admin') ? 'super_admin' : (roles[0] || admin.role || 'reader');
  const roleLabels = {
    super_admin: 'Super Administrateur',
    admin: 'Administrateur',
    operator: 'Opérateur',
    analyst: 'Analyste',
    reader: 'Lecteur',
  };

  let lastLoginAt = null;
  try {
    const rows = await query(
      `SELECT created_at FROM audit_logs
       WHERE admin_id = ? AND action IN ('login.success', 'mfa.verify_success')
       ORDER BY created_at DESC LIMIT 1`,
      [admin.id]
    );
    lastLoginAt = rows[0]?.created_at || null;
  } catch {
    lastLoginAt = null;
  }

  return {
    id: admin.id,
    full_name: admin.full_name,
    email: admin.email,
    role: admin.role,
    roles,
    role_label: roleLabels[primaryRole] || primaryRole,
    permissions,
    is_super_admin: isSuperAdmin,
    mfa_enabled: !!admin.mfa_enabled,
    is_active: admin.is_active === undefined ? true : !!admin.is_active,
    last_login_at: lastLoginAt,
    ...pwd,
  };
}

async function login(req, res, next) {
  const email = req.body?.email;
  const password = req.body?.password;
  const ip = clientIp(req);

  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email et mot de passe requis.' });
    }

    // Limitation des tentatives (par email et/ou IP).
    const lock = await tokenService.isLoginLocked(email, ip);
    if (lock.locked) {
      await audit.logFailure({ req, action: 'login.locked', resource_type: 'auth', actor: email, details: { attempts: lock.attempts } });
      return res.status(429).json({
        success: false,
        error: `Trop de tentatives. Réessayez dans ${tokenService.LOGIN_LOCK_MINUTES} minutes.`,
      });
    }

    const rows = await query('SELECT * FROM admins WHERE email = ?', [email]);
    const admin = rows[0];
    const validPassword = admin ? await bcrypt.compare(password, admin.password_hash) : false;
    const isActive = admin ? (admin.is_active === undefined ? true : !!admin.is_active) : false;

    if (!admin || !validPassword || !isActive) {
      await tokenService.recordLoginAttempt(email, ip, false);
      await audit.logFailure({ req, action: 'login.failure', resource_type: 'auth', actor: email });
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect.' });
    }

    const pwdStatus = passwordPolicy.passwordStatus(admin);
    if (pwdStatus.password_expired || pwdStatus.must_change_password) {
      const changeToken = tokenService.issueMfaToken(admin); // token temporaire 10 min
      await tokenService.recordLoginAttempt(email, ip, true);
      await audit.logSuccess({ admin, req, action: 'login.password_expired', resource_type: 'auth' });
      return res.json({
        success: true,
        data: {
          password_change_required: true,
          change_token: changeToken,
          password_expired: pwdStatus.password_expired,
          password_expiring_soon: pwdStatus.password_expiring_soon,
          password_days_remaining: pwdStatus.password_days_remaining,
          admin: { id: admin.id, email: admin.email, full_name: admin.full_name },
        },
      });
    }

    // MFA activé : renvoyer un token temporaire.
    if (admin.mfa_enabled) {
      const mfaToken = tokenService.issueMfaToken(admin);
      await tokenService.recordLoginAttempt(email, ip, true);
      await audit.logSuccess({ admin, req, action: 'login.mfa_required', resource_type: 'auth' });
      return res.json({
        success: true,
        data: { mfa_required: true, mfa_token: mfaToken },
      });
    }

    // Login normal.
    const { token, roles, permissions } = await tokenService.buildAccessToken(admin);
    const refreshToken = await tokenService.issueRefreshToken(admin.id);
    await tokenService.clearLoginAttempts(email, ip);
    await tokenService.recordLoginAttempt(email, ip, true);
    await audit.logSuccess({ admin, req, action: 'login.success', resource_type: 'auth' });

    const profile = await publicProfile(admin);
    return res.json({
      success: true,
      data: {
        token,
        refresh_token: refreshToken,
        admin: {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          role: profile.role,
          roles: profile.roles,
          role_label: profile.role_label,
          permissions: profile.permissions,
          mfa_enabled: profile.mfa_enabled,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, full_name, email, role, is_active, mfa_enabled, created_at,
              must_change_password, password_changed_at, password_expires_at
       FROM admins WHERE id = ?`,
      [req.admin.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Administrateur introuvable.' });
    }
    const profile = await publicProfile(rows[0]);
    profile.created_at = rows[0].created_at;
    return res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    const refreshToken = req.body?.refresh_token;
    if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken);
    }
    await audit.logSuccess({ admin: req.admin, req, action: 'logout', resource_type: 'auth' });
    return res.json({ success: true, message: 'Déconnexion réussie.' });
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const raw = req.body?.refresh_token;
    const rec = await tokenService.verifyRefreshToken(raw);
    if (!rec) {
      return res.status(401).json({ success: false, error: 'Refresh token invalide ou expiré.' });
    }
    const rows = await query('SELECT * FROM admins WHERE id = ?', [rec.adminId]);
    const admin = rows[0];
    if (!admin || (admin.is_active !== undefined && !admin.is_active)) {
      return res.status(401).json({ success: false, error: 'Compte indisponible.' });
    }
    // Rotation : révoquer l'ancien, en émettre un nouveau.
    await tokenService.revokeRefreshToken(raw);
    const { token } = await tokenService.buildAccessToken(admin);
    const newRefresh = await tokenService.issueRefreshToken(admin.id);
    await audit.logSuccess({ admin, req, action: 'token.refresh', resource_type: 'auth' });
    return res.json({ success: true, data: { token, refresh_token: newRefresh } });
  } catch (error) {
    next(error);
  }
}

// ---------- MFA ----------

async function mfaSetup(req, res, next) {
  try {
    const rows = await query('SELECT id, email FROM admins WHERE id = ?', [req.admin.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    const secret = await mfaService.generateSecret(rows[0].email);
    await query('UPDATE admins SET mfa_pending_secret = ? WHERE id = ?', [secret.base32, req.admin.id]);
    await audit.logSuccess({ admin: req.admin, req, action: 'mfa.setup', resource_type: 'user', resource_id: req.admin.id });
    return res.json({
      success: true,
      data: {
        secret: secret.base32,
        otpauth_url: secret.otpauth_url,
        qr_data_url: secret.qr_data_url,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function mfaEnable(req, res, next) {
  try {
    const code = req.body?.code;
    const rows = await query('SELECT id, mfa_pending_secret FROM admins WHERE id = ?', [req.admin.id]);
    const pending = rows[0]?.mfa_pending_secret;
    if (!pending) {
      return res.status(400).json({ success: false, error: 'Aucun secret MFA en attente. Lancez d\'abord le setup.' });
    }
    if (!mfaService.verifyToken(pending, code)) {
      await audit.logFailure({ admin: req.admin, req, action: 'mfa.enable_failure', resource_type: 'user', resource_id: req.admin.id });
      return res.status(400).json({ success: false, error: 'Code MFA invalide.' });
    }
    const { plain, hashed } = mfaService.generateBackupCodes();
    await query(
      'UPDATE admins SET mfa_enabled = 1, mfa_secret = ?, mfa_pending_secret = NULL, mfa_backup_codes = ? WHERE id = ?',
      [pending, JSON.stringify(hashed), req.admin.id]
    );
    await audit.logSuccess({ admin: req.admin, req, action: 'mfa.enabled', resource_type: 'user', resource_id: req.admin.id });
    return res.json({ success: true, data: { mfa_enabled: true, backup_codes: plain } });
  } catch (error) {
    next(error);
  }
}

async function mfaVerify(req, res, next) {
  const ip = clientIp(req);
  try {
    const { mfa_token: mfaToken, code } = req.body || {};
    const decoded = tokenService.verifyMfaToken(mfaToken);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Session MFA expirée. Reconnectez-vous.' });
    }
    const rows = await query('SELECT * FROM admins WHERE id = ?', [decoded.id]);
    const admin = rows[0];
    if (!admin || !admin.mfa_enabled) {
      return res.status(400).json({ success: false, error: 'MFA non applicable.' });
    }

    let ok = mfaService.verifyToken(admin.mfa_secret, code);
    // Sinon, tenter un code de secours.
    if (!ok && admin.mfa_backup_codes) {
      let list = [];
      try { list = JSON.parse(admin.mfa_backup_codes) || []; } catch (_) { list = []; }
      const next2 = mfaService.consumeBackupCode(list, code);
      if (next2) {
        ok = true;
        await query('UPDATE admins SET mfa_backup_codes = ? WHERE id = ?', [JSON.stringify(next2), admin.id]);
      }
    }

    if (!ok) {
      await tokenService.recordLoginAttempt(admin.email, ip, false);
      await audit.logFailure({ admin, req, action: 'mfa.verify_failure', resource_type: 'auth' });
      return res.status(401).json({ success: false, error: 'Code MFA invalide.' });
    }

    const { token, roles, permissions } = await tokenService.buildAccessToken(admin);
    const refreshToken = await tokenService.issueRefreshToken(admin.id);
    await tokenService.clearLoginAttempts(admin.email, ip);
    await audit.logSuccess({ admin, req, action: 'mfa.verify_success', resource_type: 'auth' });

    const profile = await publicProfile(admin);
    return res.json({
      success: true,
      data: {
        token,
        refresh_token: refreshToken,
        admin: {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          role: profile.role,
          roles: profile.roles,
          role_label: profile.role_label,
          permissions: profile.permissions,
          mfa_enabled: true,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function mfaDisable(req, res, next) {
  try {
    const { code, password } = req.body || {};
    const rows = await query('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
    const admin = rows[0];
    if (!admin || !admin.mfa_enabled) {
      return res.status(400).json({ success: false, error: 'MFA déjà désactivé.' });
    }
    const okCode = code && mfaService.verifyToken(admin.mfa_secret, code);
    const okPass = password && await bcrypt.compare(password, admin.password_hash);
    if (!okCode && !okPass) {
      await audit.logFailure({ admin, req, action: 'mfa.disable_failure', resource_type: 'user', resource_id: admin.id });
      return res.status(400).json({ success: false, error: 'Code MFA ou mot de passe requis.' });
    }
    await query(
      'UPDATE admins SET mfa_enabled = 0, mfa_secret = NULL, mfa_pending_secret = NULL, mfa_backup_codes = NULL WHERE id = ?',
      [admin.id]
    );
    await audit.logSuccess({ admin, req, action: 'mfa.disabled', resource_type: 'user', resource_id: admin.id });
    return res.json({ success: true, data: { mfa_enabled: false } });
  } catch (error) {
    next(error);
  }
}

/** Réinitialisation MFA d'un utilisateur par un Super Admin / gestionnaire. */
async function mfaReset(req, res, next) {
  try {
    const targetId = req.params.id || req.body?.user_id;
    if (!targetId) return res.status(400).json({ success: false, error: 'user_id requis.' });
    const rows = await query('SELECT id, email FROM admins WHERE id = ?', [targetId]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    await query(
      'UPDATE admins SET mfa_enabled = 0, mfa_secret = NULL, mfa_pending_secret = NULL, mfa_backup_codes = NULL WHERE id = ?',
      [targetId]
    );
    await tokenService.revokeAllRefreshTokens(targetId);
    await audit.logSuccess({ admin: req.admin, req, action: 'mfa.reset', resource_type: 'user', resource_id: targetId, details: { target_email: rows[0].email } });
    return res.json({ success: true, data: { user_id: Number(targetId), mfa_enabled: false } });
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const { current_password: currentPassword, new_password: newPassword, change_token: changeToken } = req.body || {};
    let adminId = req.admin?.id;
    let adminRow = null;

    if (changeToken && !req.admin) {
      const decoded = tokenService.verifyMfaToken(changeToken);
      if (!decoded) {
        return res.status(401).json({ success: false, error: 'Session expirée. Reconnectez-vous.' });
      }
      adminId = decoded.id;
      const rows = await query('SELECT * FROM admins WHERE id = ?', [adminId]);
      adminRow = rows[0];
    } else if (req.admin) {
      const rows = await query('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
      adminRow = rows[0];
    }

    if (!adminRow) {
      return res.status(401).json({ success: false, error: 'Authentification requise.' });
    }

    const validation = passwordPolicy.validatePassword(newPassword);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.errors.join(' ') });
    }

    const pwdStatus = passwordPolicy.passwordStatus(adminRow);
    const forcedChange = pwdStatus.password_expired || pwdStatus.must_change_password;
    if (!forcedChange && !changeToken) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, adminRow.password_hash))) {
        await audit.logFailure({ admin: req.admin, req, action: 'password.change_failure', resource_type: 'auth' });
        return res.status(400).json({ success: false, error: 'Mot de passe actuel incorrect.' });
      }
    } else if (changeToken && currentPassword) {
      const ok = await bcrypt.compare(currentPassword, adminRow.password_hash);
      if (!ok) {
        return res.status(400).json({ success: false, error: 'Mot de passe actuel incorrect.' });
      }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const expiresAt = passwordPolicy.computeExpiry();
    await query(
      `UPDATE admins SET password_hash = ?, must_change_password = 0,
       password_changed_at = NOW(), password_expires_at = ? WHERE id = ?`,
      [hash, expiresAt, adminId]
    );
    await audit.logSuccess({
      admin: req.admin || { id: adminId, email: adminRow.email, full_name: adminRow.full_name },
      req,
      action: 'password.changed',
      resource_type: 'auth',
      resource_id: adminId,
    });

    if (changeToken && !req.admin) {
      const { token, roles, permissions } = await tokenService.buildAccessToken(adminRow);
      const refreshToken = await tokenService.issueRefreshToken(adminId);
      return res.json({
        success: true,
        data: {
          token,
          refresh_token: refreshToken,
          admin: {
            id: adminRow.id,
            full_name: adminRow.full_name,
            email: adminRow.email,
            role: adminRow.role,
            roles,
            permissions,
            mfa_enabled: !!adminRow.mfa_enabled,
          },
        },
      });
    }

    return res.json({ success: true, message: 'Mot de passe mis à jour.' });
  } catch (error) {
    next(error);
  }
}

async function listSessions(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, created_at, expires_at, revoked
       FROM refresh_tokens WHERE admin_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.admin.id]
    );
    const sessions = rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      expires_at: r.expires_at,
      active: !r.revoked && new Date(r.expires_at) > new Date(),
    }));
    return res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
}

async function revokeSession(req, res, next) {
  try {
    const sessionId = req.params.id;
    await query(
      'UPDATE refresh_tokens SET revoked = 1 WHERE id = ? AND admin_id = ?',
      [sessionId, req.admin.id]
    );
    await audit.logSuccess({ admin: req.admin, req, action: 'session.revoked', resource_type: 'auth', resource_id: sessionId });
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  getMe,
  logout,
  refresh,
  mfaSetup,
  mfaEnable,
  mfaVerify,
  mfaDisable,
  mfaReset,
  changePassword,
  listSessions,
  revokeSession,
};
