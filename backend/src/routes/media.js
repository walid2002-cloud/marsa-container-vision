const express = require('express');
const { getIntegrationPublicBase, getPublicBase } = require('../utils/publicUrl');
const { inspectProofAsset, loadProofBuffer, AI_SERVICE_URL } = require('../services/proofMediaService');

const router = express.Router();

async function sendProofFile(req, res) {
  const loaded = await loadProofBuffer(req.params.filename);
  if (!loaded.ok) {
    return res.status(loaded.status || 400).type('text/plain').send(loaded.reason || 'invalid proof');
  }
  res.status(200);
  res.setHeader('Content-Type', loaded.mimeType);
  res.setHeader('Content-Length', String(loaded.size));
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(loaded.buf);
}

/** GET /api/media/results/:filename — image brute (preuves IA uniquement). */
router.get('/media/results/:filename', sendProofFile);

/** Alias /api/results/:filename */
router.get('/results/:filename', sendProofFile);

router.get('/media/health', async (_req, res) => {
  const sample = await inspectProofAsset('/results/evidence_placeholder.png').catch(() => null);
  res.json({
    ok: true,
    ai_service_url: AI_SERVICE_URL,
    public_base_url: getPublicBase(),
    integration_public_base_url: getIntegrationPublicBase(),
    public_base_configured: Boolean(getIntegrationPublicBase()),
    proof_storage: 'ai_service_results',
    sample_probe: sample ? { reason: sample.reason, available: sample.available } : null,
  });
});

module.exports = router;
