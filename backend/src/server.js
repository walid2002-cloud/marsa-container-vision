const http = require('http');
const path = require('path');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Server } = require('socket.io');
require('dotenv').config();

const { testConnection } = require('./config/database');
const { ensureSchema } = require('./config/ensureSchema');
const authRoutes = require('./routes/auth');
const searchRoutes = require('./routes/search');
const detectionRoutes = require('./routes/detections');
const containerRoutes = require('./routes/containers');
const alertRoutes = require('./routes/alerts');
const outboundNotificationRoutes = require('./routes/outboundNotifications');
const healthRoutes = require('./routes/health');
const integrationRoutes = require('./routes/integrations');
const cameraRoutes = require('./routes/cameras');
const visionRoutes = require('./routes/vision');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
const roleRoutes = require('./routes/roles');
const auditRoutes = require('./routes/audit');
const proofRoutes = require('./routes/proofs');
const systemRoutes = require('./routes/system');
const settingsRoutes = require('./routes/settings');
const errorHandler = require('./middleware/errorHandler');
const { securityHeaders, rateLimit } = require('./middleware/securityHeaders');
const { getUploadsRoot, ensureUploadDir } = require('./services/visionStorageService');

const app = express();
const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
});
app.set('io', io);

const corsOrigins = process.env.CORS_ORIGINS;
app.use(securityHeaders);
app.use(rateLimit({ windowMs: 60_000, max: 200 }));
app.use(
  cors({
    origin: corsOrigins ? corsOrigins.split(',').map((s) => s.trim()) : true,
  })
);
app.use(express.json());
app.use(morgan('dev'));

try {
  ensureUploadDir();
  app.use('/api/uploads/vision', express.static(getUploadsRoot()));
  app.get('/api/vision/proofs/:filename', (req, res, next) => {
    const file = path.basename(req.params.filename);
    const full = path.join(getUploadsRoot(), file);
    if (!full.startsWith(getUploadsRoot())) {
      return res.status(400).json({ error: 'Chemin invalide.' });
    }
    return res.sendFile(full, (err) => {
      if (err) next(err);
    });
  });
  const AI_PROXY = process.env.AI_SERVICE_URL || 'http://localhost:5082';
  app.use('/ai', async (req, res) => {
    try {
      const dest = `${AI_PROXY.replace(/\/$/, '')}${req.url}`;
      const r = await axios.get(dest, { responseType: 'arraybuffer', timeout: 25000, validateStatus: () => true });
      const ct = r.headers['content-type'] || 'application/octet-stream';
      res.status(r.status).set('Content-Type', ct).send(Buffer.from(r.data));
    } catch (e) {
      res.status(502).json({ success: false, error: 'Proxy assets IA indisponible.' });
    }
  });
} catch (e) {
  console.warn('[Backend] Dossier uploads vision :', e.message);
}

// Public routes
app.use('/api', authRoutes);
app.use('/api', healthRoutes);

// Integration routes (API key auth)
app.use('/api', integrationRoutes);
const mediaRoutes = require('./routes/media');
app.use('/api', mediaRoutes);

// Protected routes (JWT auth)
app.use('/api', searchRoutes);
app.use('/api', detectionRoutes);
app.use('/api', containerRoutes);
app.use('/api', alertRoutes);
app.use('/api', outboundNotificationRoutes);
app.use('/api', cameraRoutes);
app.use('/api', visionRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', notificationRoutes);

// Phase 6 — Sécurité : gestion utilisateurs, rôles, journal d'audit (RBAC).
app.use('/api', userRoutes);
app.use('/api', roleRoutes);
app.use('/api', auditRoutes);
app.use('/api', proofRoutes);
app.use('/api', systemRoutes);
app.use('/api', settingsRoutes);

app.use(errorHandler);

async function startServer() {
  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.warn('[WARN] MySQL non disponible. Le serveur démarre sans base de données.');
    console.warn('[WARN] Les données ne seront pas persistées.');
  } else {
    try {
      await ensureSchema();
    } catch (e) {
      console.warn('[WARN] Migration schéma :', e.message);
    }
  }

  server.listen(PORT, () => {
    console.log(`[Backend] Serveur démarré sur le port ${PORT}`);
    console.log(`[Backend] Mode : ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Backend] Service IA : ${process.env.AI_SERVICE_URL || 'http://localhost:5082'}`);
    console.log('[Backend] WebSocket (Socket.IO) actif.');
  });
}

startServer();
