const express = require('express');
const router = express.Router();
const { searchContainer } = require('../controllers/searchController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

router.post('/search-container', authenticateToken, requirePermission('containers.search'), searchContainer);

module.exports = router;
