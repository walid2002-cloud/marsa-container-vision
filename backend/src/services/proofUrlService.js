/**
 * URLs publiques pour preuves visuelles (web + WhatsApp / Marsa Maroc AI).
 *
 * PUBLIC_APP_URL / NGROK_URL : UI Container Vision (5080).
 * INTEGRATION_PUBLIC_BASE_URL : tunnel ngrok Marsa Maroc AI (backend :3000) — preuves /ai/...
 */
const {
  proofPublicUrl,
  integrationProofPublicUrl,
  normalizeProofRelativePath,
  isLocalhostUrl,
  getIntegrationPublicBase,
} = require('../utils/publicUrl');

const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'http://localhost:5080').replace(/\/+$/, '');

function resolvePublicProofUrl(relativePath) {
  return integrationProofPublicUrl(relativePath) || proofPublicUrl(relativePath);
}

function resolveWebProofUrl(relativePath) {
  return proofPublicUrl(relativePath);
}

function resolveIntegrationProofUrl(relativePath) {
  return integrationProofPublicUrl(relativePath);
}

function whatsappProofNote(publicUrl) {
  if (!publicUrl) {
    return 'Image preuve disponible dans l\'interface web uniquement.';
  }
  if (isLocalhostUrl(publicUrl)) {
    const baseHint = getIntegrationPublicBase();
    if (isLocalhostUrl(baseHint)) {
      return (
        'Image preuve disponible dans l\'interface web. ' +
        'Pour WhatsApp via Marsa Maroc AI, définissez INTEGRATION_PUBLIC_BASE_URL=https://votre-tunnel-ngrok ' +
        '(backend Marsa :3000, pas le port 5080).'
      );
    }
  }
  return null;
}

module.exports = {
  PUBLIC_APP_URL,
  resolvePublicProofUrl,
  resolveWebProofUrl,
  resolveIntegrationProofUrl,
  normalizeProofRelativePath,
  isLocalhostUrl,
  whatsappProofNote,
};
