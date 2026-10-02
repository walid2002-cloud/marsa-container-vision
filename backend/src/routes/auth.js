const express = require('express');
const router = express.Router();
const {
  login, getMe, logout, refresh,
  mfaSetup, mfaEnable, mfaVerify, mfaDisable, mfaReset,
  changePassword, listSessions, revokeSession,
} = require('../controllers/authController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { authRateLimit } = require('../middleware/securityHeaders');

// Public
router.post('/auth/login', authRateLimit, login);
router.post('/auth/refresh', refresh);
router.post('/auth/mfa/verify', mfaVerify);
router.post('/auth/change-password', changePassword);

// Authentifié
router.get('/auth/me', authenticateToken, getMe);
router.post('/auth/logout', authenticateToken, logout);
router.post('/auth/password/change', authenticateToken, changePassword);
router.get('/auth/sessions', authenticateToken, listSessions);
router.delete('/auth/sessions/:id', authenticateToken, revokeSession);
router.post('/auth/mfa/setup', authenticateToken, mfaSetup);
router.post('/auth/mfa/enable', authenticateToken, mfaEnable);
router.post('/auth/mfa/disable', authenticateToken, mfaDisable);

// Réinitialisation MFA d'un autre utilisateur (gestion des utilisateurs)
router.post('/auth/mfa/reset', authenticateToken, requirePermission('users.update'), mfaReset);

module.exports = router;
