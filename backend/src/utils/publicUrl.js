/**
 * Phase 7 — Génération centralisée des URLs publiques.
 *
 * Deux bases distinctes :
 *   - UI / dashboard / carte : getPublicBase() — NGROK_URL > PUBLIC_APP_URL > localhost:5080
 *   - Preuves WhatsApp / Marsa Maroc AI (proxy ngrok → :3000) : getIntegrationPublicBase()
 *     INTEGRATION_PUBLIC_BASE_URL > MARSA_PUBLIC_PROXY_URL > NGROK_URL > PUBLIC_APP_URL
 *
 * Ne jamais retourner un chemin local sensible (/app/uploads/...) dans les réponses externes.
 */

function stripTrailing(u) {
  return String(u || '').replace(/\/+$/, '');
}

/** Base publique UI Container Vision (5080). */
function getPublicBase() {
  const publicBase = process.env.PUBLIC_BASE_URL && String(process.env.PUBLIC_BASE_URL).trim();
  if (publicBase) return stripTrailing(publicBase);
  const ngrok = process.env.NGROK_URL && process.env.NGROK_URL.trim();
  if (ngrok) return stripTrailing(ngrok);
  const publicApp = process.env.PUBLIC_APP_URL && process.env.PUBLIC_APP_URL.trim();
  if (publicApp) return stripTrailing(publicApp);
  return 'http://localhost:5080';
}

function isUsableIntegrationBase(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === 'host.docker.internal') {
      return false;
    }
    if (u.port === '5080') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Base publique pour preuves servies via Marsa Maroc AI (un tunnel ngrok → backend :3000).
 * Jamais localhost / 127.0.0.1 / :5080. Null si non configurée.
 */
function getIntegrationPublicBase() {
  const integrationKeys = [
    'INTEGRATION_PUBLIC_BASE_URL',
    'MARSA_PUBLIC_PROXY_URL',
    'MARSA_PUBLIC_URL',
    'NGROK_URL',
  ];
  for (const key of integrationKeys) {
    const v = process.env[key] && String(process.env[key]).trim();
    if (v && isUsableIntegrationBase(v)) return stripTrailing(v);
  }
  return null;
}

/**
 * Normalise un chemin preuve IA en chemin proxy nginx (/ai/...).
 * @returns {string|null}
 */
function normalizeProofRelativePath(relativePath) {
  if (!relativePath) return null;
  const p = String(relativePath).trim();
  if (!p) return null;
  if (p.startsWith('http://') || p.startsWith('https://')) {
    try {
      const u = new URL(p);
      return normalizeProofRelativePath(u.pathname);
    } catch {
      return null;
    }
  }
  let path = p.startsWith('/') ? p : `/${p}`;
  if (path.startsWith('/api/uploads/vision/')) return path;
  if (path.startsWith('/ai/')) return path;
  if (path.startsWith('/demo_images/') || path.startsWith('/demo_images')) {
    return path.startsWith('/ai/') ? path : `/ai${path.startsWith('/') ? path : `/${path}`}`;
  }
  if (path.startsWith('/results/') || path === '/results' || path.startsWith('/results')) {
    return `/ai${path.startsWith('/') ? path : `/${path}`}`;
  }
  if (path.startsWith('/api/')) return path;
  return `/ai${path}`;
}

function joinBasePath(base, path) {
  const b = stripTrailing(base);
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** Construit une URL publique absolue à partir d'un chemin (UI). */
function publicUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  const p = String(pathOrUrl).trim();
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  return joinBasePath(getPublicBase(), p);
}

/**
 * Résout une preuve en URL publique navigable (UI Container Vision, port 5080 ou NGROK CV).
 */
function proofPublicUrl(relativePath) {
  if (!relativePath) return null;
  const p = String(relativePath).trim();
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const normalized = normalizeProofRelativePath(p);
  if (!normalized) return null;
  return joinBasePath(getPublicBase(), normalized);
}

/** URL preuve pour WhatsApp / Marsa (base INTEGRATION_PUBLIC_BASE_URL = ngrok Marsa → 3000). */
function integrationProofPublicUrl(relativePath) {
  if (!relativePath) return null;
  const base = getIntegrationPublicBase();
  if (!base) return null;
  const p = String(relativePath).trim();
  const normalized = normalizeProofRelativePath(p);
  if (!normalized) return null;
  return joinBasePath(base, normalized);
}

/** URL de la page détail conteneur (frontend). */
function dashboardUrl(code) {
  if (!code) return null;
  return `${getPublicBase()}/containers/${encodeURIComponent(code)}`;
}

/** URL de la carte terminal préremplie (zone / caméra / code). */
function mapUrl({ zone, camera, code } = {}) {
  const params = new URLSearchParams();
  if (zone) params.set('zone', zone);
  if (camera) params.set('camera', camera);
  if (code) params.set('code', code);
  const qs = params.toString();
  return `${getPublicBase()}/terminal-map${qs ? `?${qs}` : ''}`;
}

/** URL publique d'une preuve par son identifiant (image directe). */
function proofDownloadUrl(proofId) {
  if (!proofId) return null;
  return `${getPublicBase()}/api/proofs/${encodeURIComponent(proofId)}/download`;
}

function proofThumbnailUrl(proofId) {
  if (!proofId) return null;
  return `${getPublicBase()}/api/proofs/${encodeURIComponent(proofId)}/thumbnail`;
}

function isLocalhostUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === 'host.docker.internal';
  } catch {
    return true;
  }
}

module.exports = {
  getPublicBase,
  getIntegrationPublicBase,
  isUsableIntegrationBase,
  normalizeProofRelativePath,
  publicUrl,
  proofPublicUrl,
  integrationProofPublicUrl,
  dashboardUrl,
  mapUrl,
  proofDownloadUrl,
  proofThumbnailUrl,
  isLocalhostUrl,
};
