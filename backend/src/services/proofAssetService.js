const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getUploadsRoot } = require('./visionStorageService');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:5082').replace(/\/+$/, '');

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal'].includes(hostname);
}

/**
 * Convertit un chemin/URL de preuve (MySQL / IA / uploads) en URL fetchable par Express.
 * Jamais de MinIO interne : disque vision + service IA.
 */
function toUpstreamUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  const p = String(pathOrUrl).trim();
  if (!p || p === 'null') return null;

  if (p.startsWith('/api/uploads/vision/')) {
    const file = path.basename(p);
    return { kind: 'file', filePath: path.join(getUploadsRoot(), file) };
  }

  if (p.startsWith('http://') || p.startsWith('https://')) {
    try {
      const u = new URL(p);
      if (isLocalHost(u.hostname)) {
        if (u.pathname.startsWith('/api/uploads/vision/')) {
          return { kind: 'file', filePath: path.join(getUploadsRoot(), path.basename(u.pathname)) };
        }
        if (u.pathname.startsWith('/ai/')) {
          return { kind: 'http', url: `${AI_SERVICE_URL}${u.pathname.slice(3)}` };
        }
        if (u.pathname.startsWith('/demo_images') || u.pathname.startsWith('/results') || u.pathname.startsWith('/api/')) {
          return { kind: 'http', url: `${AI_SERVICE_URL}${u.pathname.replace(/^\/api/, '')}` };
        }
        return { kind: 'http', url: `${AI_SERVICE_URL}${u.pathname}` };
      }
      return { kind: 'http', url: p };
    } catch {
      return null;
    }
  }

  if (p.startsWith('/ai/')) return { kind: 'http', url: `${AI_SERVICE_URL}${p.slice(3)}` };
  if (p.startsWith('/demo_images') || p.startsWith('/results')) {
    return { kind: 'http', url: `${AI_SERVICE_URL}${p}` };
  }
  if (p.startsWith('/api/')) return { kind: 'relative', url: p };
  return { kind: 'http', url: `${AI_SERVICE_URL}${p.startsWith('/') ? p : `/${p}`}` };
}

async function streamProofAsset(pathOrUrl, res) {
  const raw = String(pathOrUrl || '');
  if (/\/api\/media\/file/.test(raw)) {
    res.status(400).json({ success: false, error: 'Source média invalide.' });
    return;
  }
  const dest = toUpstreamUrl(pathOrUrl);
  if (!dest) {
    res.status(404).json({ success: false, error: 'Image preuve introuvable.' });
    return;
  }
  if (dest.kind === 'file') {
    if (!dest.filePath.startsWith(getUploadsRoot()) || !fs.existsSync(dest.filePath)) {
      res.status(404).json({ success: false, error: 'Fichier preuve absent.' });
      return;
    }
    res.sendFile(dest.filePath);
    return;
  }
  const url = dest.url;
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    validateStatus: () => true,
    maxRedirects: 3,
  });
  if (r.status >= 400) {
    res.status(r.status).json({ success: false, error: 'Impossible de charger l’image preuve.' });
    return;
  }
  const ct = r.headers['content-type'] || 'image/jpeg';
  res.set('Content-Type', ct);
  res.set('Cache-Control', 'public, max-age=120');
  res.send(Buffer.from(r.data));
}

function relativeProofUrl(proofUuid) {
  if (!proofUuid) return null;
  return `/api/proofs/${encodeURIComponent(proofUuid)}/download`;
}

function relativeMediaFileUrl(src) {
  if (!src) return null;
  return `/api/media/file?src=${encodeURIComponent(String(src))}`;
}

module.exports = {
  toUpstreamUrl,
  streamProofAsset,
  relativeProofUrl,
  relativeMediaFileUrl,
};
