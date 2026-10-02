/**
 * Phase 7 — État des services (dashboard).
 * GET /api/system/status : backend, database, ai_service, camera_simulation,
 * terminal_map, alerts, notifications, storage, integration_api.
 */
const fs = require('fs');
const axios = require('axios');
const { pool, testConnection } = require('../config/database');
const { getUploadsRoot } = require('../services/visionStorageService');
const settingsService = require('../services/settingsService');
const registeredCameras = require('../services/registeredCameraService');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
const MARSA_AI_URL = process.env.MARSA_AI_URL || 'http://localhost:5173';

/** URL pour ping santé depuis le backend (navigateur ≠ conteneur Docker). */
function marsaAiHealthBase(publicUrl) {
  const explicit = process.env.MARSA_AI_HEALTH_URL;
  if (explicit) return String(explicit).replace(/\/$/, '');
  const pub = String(publicUrl || MARSA_AI_URL || '').replace(/\/$/, '');
  if (!pub) return '';
  let inDocker = false;
  try {
    inDocker = fs.existsSync('/.dockerenv');
  } catch {
    inDocker = false;
  }
  if (inDocker && /localhost|127\.0\.0\.1/.test(pub)) {
    return pub.replace(/localhost/g, 'host.docker.internal').replace(/127\.0\.0\.1/g, 'host.docker.internal');
  }
  return pub;
}

function svc(status, message) {
  return { status, message, checked_at: new Date().toISOString() };
}

async function tableHasRows(name) {
  try {
    const [rows] = await pool.query(`SHOW TABLES LIKE '${name}'`);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function getCameraHealth() {
  const cameras = await registeredCameras.listRegistered();
  const configured = cameras.length;
  let online = 0;
  let offline = 0;
  let stale = 0;
  let degraded = 0;
  const staleMinutes = 15;
  const now = Date.now();

  for (const cam of cameras) {
    if (cam.last_test_ok === true) online += 1;
    else if (cam.last_test_ok === false) offline += 1;
    if (cam.last_snapshot_at) {
      const age = (now - new Date(cam.last_snapshot_at).getTime()) / 60000;
      if (age > staleMinutes) stale += 1;
    } else if (cam.rtsp_configured) {
      stale += 1;
    }
    if (cam.last_test_ok === false && cam.rtsp_configured) degraded += 1;
  }

  return {
    configured,
    online,
    offline,
    stale_no_frame: stale,
    degraded_streams: degraded,
    stale_threshold_minutes: staleMinutes,
  };
}

async function getStatus(req, res, next) {
  try {
    const services = {};
    const appMode = await settingsService.getAppMode();

    services.backend = svc('healthy', 'API opérationnelle.');

    // Base de données
    const dbOk = await testConnection();
    services.database = dbOk
      ? svc('healthy', 'Connexion MySQL établie.')
      : svc('down', 'MySQL indisponible.');

    // Service IA
    try {
      const r = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 4000 });
      const mode = r.data?.detection_mode || 'demo';
      services.ai_service = svc('healthy', `Service IA actif (mode : ${mode}).`);
    } catch (e) {
      services.ai_service = svc('degraded', "Service IA injoignable — bascule en mode dégradé.");
    }

    // Simulation caméra (mode démo)
    services.camera_simulation = appMode === 'DEMO'
      ? svc('healthy', 'Simulation caméra active (mode démo).')
      : svc('degraded', 'Mode production — simulation désactivée côté métier.');

    // Santé caméras RTSP
    try {
      const camHealth = await getCameraHealth();
      services.camera_health = svc(
        camHealth.offline > 0 || camHealth.degraded_streams > 0 ? 'degraded' : 'healthy',
        `${camHealth.configured} configurée(s), ${camHealth.online} online, ${camHealth.offline} offline.`
      );
    } catch {
      services.camera_health = svc('degraded', 'Statistiques caméras indisponibles.');
    }

    // Marsa Maroc AI (ping via URL adaptée Docker ; lien utilisateur = localhost:5173)
    const marsaUrl = (await settingsService.getSetting('marsa_ai_url')) || MARSA_AI_URL;
    const healthBase = marsaAiHealthBase(marsaUrl);
    if (marsaUrl && healthBase) {
      try {
        await axios.get(`${healthBase}/api/health`, { timeout: 4000 });
        services.marsa_ai = svc('healthy', 'Marsa Maroc AI connecté.');
      } catch {
        services.marsa_ai = svc(
          'degraded',
          'Marsa Maroc AI injoignable depuis le backend. Vérifiez que marsamaroc tourne (port 5173).'
        );
      }
    } else {
      services.marsa_ai = svc('degraded', 'MARSA_AI_URL non configuré.');
    }

    // Carte terminal
    services.terminal_map = svc('healthy', 'Carte du terminal disponible.');

    // Alertes
    services.alerts = (await tableHasRows('alerts'))
      ? svc('healthy', 'Système d\'alertes opérationnel.')
      : svc('degraded', 'Table alertes absente.');

    // Notifications
    const notifEnabled = String(process.env.NOTIFICATIONS_ENABLED || 'true').toLowerCase() !== 'false';
    const simMode = String(process.env.NOTIFICATION_SIMULATION_MODE || 'true').toLowerCase() !== 'false';
    services.notifications = (await tableHasRows('outbound_notifications'))
      ? svc('healthy', notifEnabled ? (simMode ? 'Notifications actives (mode simulation).' : 'Notifications actives.') : 'Notifications désactivées.')
      : svc('degraded', 'Table notifications absente.');

    // Stockage
    try {
      const root = getUploadsRoot();
      const exists = fs.existsSync(root);
      services.storage = exists
        ? svc('healthy', 'Stockage des preuves disponible.')
        : svc('degraded', 'Dossier de stockage introuvable.');
    } catch (e) {
      services.storage = svc('degraded', 'Stockage non vérifiable.');
    }

    // API d'intégration
    services.integration_api = process.env.INTEGRATION_API_KEY
      ? svc('healthy', "Clé d'intégration configurée.")
      : svc('degraded', "Clé d'intégration non configurée.");

    const statuses = Object.values(services).map((s) => s.status);
    const overall = statuses.includes('down')
      ? 'down'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'healthy';

    return res.json({
      success: true,
      data: {
        overall,
        app_mode: appMode,
        marsa_ai_url: marsaUrl || null,
        camera_health: await getCameraHealth().catch(() => null),
        services,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStatus };
