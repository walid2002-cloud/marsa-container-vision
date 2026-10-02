const express = require('express');
const router = express.Router();
const {
  listUsers, getUser, createUser, updateUser, deleteUser, setRoles,
} = require('../controllers/userController');
const { mfaReset } = require('../controllers/authController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

router.get('/users', authenticateToken, requirePermission('users.read'), listUsers);
router.post('/users', authenticateToken, requirePermission('users.create'), createUser);
router.get('/users/:id', authenticateToken, requirePermission('users.read'), getUser);
router.put('/users/:id', authenticateToken, requirePermission('users.update'), updateUser);
router.delete('/users/:id', authenticateToken, requirePermission('users.delete'), deleteUser);
router.put('/users/:id/roles', authenticateToken, requirePermission('roles.manage'), setRoles);
router.post('/users/:id/reset-mfa', authenticateToken, requirePermission('users.update'), mfaReset);

module.exports = router;
