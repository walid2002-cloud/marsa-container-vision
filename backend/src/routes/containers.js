const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const {
  getContainerPosition,
  getContainerMovements,
  terminalMap,
  getContainerReport,
  watchContainer,
  unwatchContainer,
  listWatched,
} = require('../controllers/containerController');

router.get('/terminal-map', authenticateToken, requirePermission('terminal_map.read'), terminalMap);
router.get('/watched-containers', authenticateToken, requirePermission('containers.read_tracking'), listWatched);
router.post('/containers/:code/watch', authenticateToken, requirePermission('containers.search'), watchContainer);
router.delete('/containers/:code/watch', authenticateToken, requirePermission('containers.search'), unwatchContainer);
router.get('/containers/:code/position', authenticateToken, requirePermission('containers.read_tracking'), getContainerPosition);
router.get('/containers/:code/movements', authenticateToken, requirePermission('containers.read_tracking'), getContainerMovements);
router.get('/containers/:code/report', authenticateToken, requirePermission('containers.read_tracking'), getContainerReport);
router.get('/containers/:code', authenticateToken, requirePermission('containers.read_tracking'), getContainerReport);

module.exports = router;
