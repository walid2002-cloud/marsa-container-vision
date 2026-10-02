const express = require('express');
const router = express.Router();
const { listRoles, listPermissions, setRolePermissions } = require('../controllers/roleController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

router.get('/roles', authenticateToken, requirePermission('users.read'), listRoles);
router.get('/permissions', authenticateToken, requirePermission('users.read'), listPermissions);
router.put('/roles/:id/permissions', authenticateToken, requirePermission('roles.manage'), setRolePermissions);

module.exports = router;
