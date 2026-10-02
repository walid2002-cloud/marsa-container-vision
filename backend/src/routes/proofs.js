const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { getProof, getProofsByContainer, downloadProof, thumbnailProof, mediaFile } = require('../controllers/proofController');

// Métadonnées — authentifié (uploads.read)
router.get('/proofs/container/:code', authenticateToken, requirePermission('uploads.read'), getProofsByContainer);
router.get('/proofs/:proofId', authenticateToken, requirePermission('uploads.read'), getProof);

// Image / miniature — accès public contrôlé (redirection vers URL publique résolue)
router.get('/proofs/:proofId/download', downloadProof);
router.get('/proofs/:proofId/thumbnail', thumbnailProof);
router.get('/media/file', mediaFile);

module.exports = router;
