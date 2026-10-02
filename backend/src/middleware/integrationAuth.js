const audit = require('../services/auditService');
const { maskSecret } = require('../utils/maskSecret');

const INTEGRATION_API_KEY = process.env.INTEGRATION_API_KEY || '';

function authenticateIntegration(req, res, next) {
  const key = req.headers['x-integration-key'];

  if (!INTEGRATION_API_KEY) {
    console.error('[INTEGRATION] INTEGRATION_API_KEY non configurée côté serveur.');
    return res.status(500).json({
      success: false,
      error: "Intégration non configurée côté serveur.",
    });
  }

  if (!key || key !== INTEGRATION_API_KEY) {
    // Audit best-effort : ne jamais enregistrer la clé complète.
    audit.logFailure({
      req,
      actor: 'integration',
      action: 'integration.auth_failed',
      resource_type: 'integration',
      status: 401,
      details: {
        reason: key ? 'invalid_key' : 'missing_key',
        provided_key: key ? maskSecret(String(key)) : null,
        container_code: req.body?.container_code || null,
        source: req.body?.source || null,
      },
    }).catch(() => {});

    return res.status(401).json({
      success: false,
      error: "Clé d'intégration manquante ou invalide.",
    });
  }

  next();
}

module.exports = { authenticateIntegration };
