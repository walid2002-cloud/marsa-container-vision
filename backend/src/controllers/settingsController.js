const settingsService = require('../services/settingsService');
const audit = require('../services/auditService');

async function getSettings(req, res, next) {
  try {
    const settings = await settingsService.getAllSettings();
    const appMode = await settingsService.getAppMode();
    return res.json({
      success: true,
      data: {
        ...settings,
        app_mode: appMode,
        marsa_ai_url: settings.marsa_ai_url || process.env.MARSA_AI_URL || '',
        detection_mode_env: process.env.DETECTION_MODE || 'demo',
      },
    });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const { app_mode: appMode, marsa_ai_url: marsaAiUrl } = req.body || {};
    const updates = {};
    if (appMode != null) {
      const normalized = String(appMode).toUpperCase();
      if (!['DEMO', 'PRODUCTION'].includes(normalized)) {
        return res.status(400).json({ success: false, error: 'app_mode doit être DEMO ou PRODUCTION.' });
      }
      await settingsService.setSetting('app_mode', normalized, req.admin.id);
      updates.app_mode = normalized;
    }
    if (marsaAiUrl != null) {
      await settingsService.setSetting('marsa_ai_url', String(marsaAiUrl).trim(), req.admin.id);
      updates.marsa_ai_url = String(marsaAiUrl).trim();
    }
    await audit.logSuccess({
      admin: req.admin,
      req,
      action: 'settings.updated',
      resource_type: 'settings',
      details: updates,
    });
    const settings = await settingsService.getAllSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
