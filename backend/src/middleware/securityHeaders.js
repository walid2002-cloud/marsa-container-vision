/**
 * En-têtes de sécurité HTTP + rate limiting basique en mémoire.
 */
const buckets = new Map();

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.removeHeader('X-Powered-By');
  next();
}

function rateLimit({ windowMs = 60_000, max = 120, keyFn } = {}) {
  const fn = keyFn || ((req) => req.ip || 'unknown');
  return (req, res, next) => {
    const key = `${fn(req)}:${req.path.startsWith('/api/auth') ? 'auth' : 'api'}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ success: false, error: 'Trop de requêtes. Réessayez plus tard.' });
    }
    next();
  };
}

const authRateLimit = rateLimit({ windowMs: 15 * 60_000, max: 30, keyFn: (req) => req.body?.email || req.ip });

module.exports = { securityHeaders, rateLimit, authRateLimit };
