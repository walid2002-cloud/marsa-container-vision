/**
 * Phase 6 — Masquage des secrets.
 * Ne jamais exposer un secret complet côté frontend ou dans les logs.
 * Exemple : "abc123defghijklxyz" -> "abc123********klxyz"
 */

const SECRET_KEY_PATTERN = /(secret|password|passwd|token|api[_-]?key|apikey|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|integration[_-]?key|smtp[_-]?pass|whatsapp[_-]?token|meta[_-]?token|sms[_-]?key|otp|mfa[_-]?secret|backup[_-]?codes)/i;

function maskSecret(value, { start = 6, end = 4 } = {}) {
  if (value === null || value === undefined) return value;
  const str = String(value);
  if (str.length === 0) return str;
  if (str.length <= start + end) {
    return '*'.repeat(Math.max(4, str.length));
  }
  const head = str.slice(0, start);
  const tail = str.slice(-end);
  return `${head}********${tail}`;
}

function isSecretKey(key) {
  return SECRET_KEY_PATTERN.test(String(key || ''));
}

/**
 * Parcourt un objet et masque récursivement toute valeur dont la clé ressemble
 * à un secret. Renvoie une copie ; ne modifie pas l'entrée.
 */
function maskSecretsDeep(input) {
  if (Array.isArray(input)) {
    return input.map((v) => maskSecretsDeep(v));
  }
  if (input && typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (isSecretKey(k) && (typeof v === 'string' || typeof v === 'number')) {
        out[k] = v ? maskSecret(v) : v;
      } else if (v && typeof v === 'object') {
        out[k] = maskSecretsDeep(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return input;
}

module.exports = { maskSecret, isSecretKey, maskSecretsDeep };
