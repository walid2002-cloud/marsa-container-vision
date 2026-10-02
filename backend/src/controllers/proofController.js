/**
 * Phase 7 — Contrôleur des preuves visuelles.
 * Download : stream (pas de 302 vers localhost — cassé sur iPhone).
 */
const visualProofService = require('../services/visualProofService');
const { streamProofAsset } = require('../services/proofAssetService');
const audit = require('../services/auditService');

async function getProof(req, res, next) {
  try {
    const proof = await visualProofService.getProofByUuid(req.params.proofId);
    if (!proof) return res.status(404).json({ success: false, error: 'Preuve introuvable.' });
    await audit.logSuccess({ admin: req.admin, req, action: 'proof.view', resource_type: 'proof', resource_id: req.params.proofId });
    return res.json({ success: true, data: proof });
  } catch (err) { next(err); }
}

async function getProofsByContainer(req, res, next) {
  try {
    const proofs = await visualProofService.getProofsForContainer(req.params.code, req.query.limit);
    return res.json({ success: true, data: proofs, count: proofs.length });
  } catch (err) { next(err); }
}

async function downloadProof(req, res, next) {
  try {
    const row = await visualProofService.getRawProof(req.params.proofId);
    if (!row) return res.status(404).json({ success: false, error: 'Preuve introuvable.' });
    const src = row.image_url || row.image_path;
    if (!src) {
      return res.status(410).json({ success: false, error: "L'image preuve n'est plus disponible." });
    }
    try {
      await audit.logSuccess({ req, action: 'proof.download', resource_type: 'proof', resource_id: req.params.proofId, actor: 'public' });
    } catch (_) { /* best effort */ }
    await streamProofAsset(src, res);
  } catch (err) { next(err); }
}

async function thumbnailProof(req, res, next) {
  return downloadProof(req, res, next);
}

async function mediaFile(req, res, next) {
  try {
    const src = req.query.src;
    if (!src || String(src).length > 800) {
      return res.status(400).json({ success: false, error: 'src requis.' });
    }
    await streamProofAsset(String(src), res);
  } catch (err) { next(err); }
}

module.exports = { getProof, getProofsByContainer, downloadProof, thumbnailProof, mediaFile };
