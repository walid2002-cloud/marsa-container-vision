/**
 * Politique mot de passe — alignée Marsa Maroc AI.
 * Minimum 9 caractères, expiration 30 jours, complexité requise.
 */

const PASSWORD_MIN_LENGTH = 9;
const PASSWORD_EXPIRY_DAYS = 30;
const PASSWORD_WARNING_DAYS = 7;

const POLICY_RULES = [
  { test: (p) => p.length >= PASSWORD_MIN_LENGTH, message: `Minimum ${PASSWORD_MIN_LENGTH} caractères.` },
  { test: (p) => /[A-Z]/.test(p), message: 'Au moins une majuscule.' },
  { test: (p) => /[a-z]/.test(p), message: 'Au moins une minuscule.' },
  { test: (p) => /[0-9]/.test(p), message: 'Au moins un chiffre.' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), message: 'Au moins un caractère spécial.' },
];

function validatePassword(password) {
  const errors = [];
  const p = String(password || '');
  for (const rule of POLICY_RULES) {
    if (!rule.test(p)) errors.push(rule.message);
  }
  return { valid: errors.length === 0, errors };
}

function computeExpiry(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + PASSWORD_EXPIRY_DAYS);
  return d;
}

function passwordStatus(admin) {
  const now = new Date();
  const expiresAt = admin.password_expires_at ? new Date(admin.password_expires_at) : null;
  const changedAt = admin.password_changed_at ? new Date(admin.password_changed_at) : null;
  const expired = expiresAt ? expiresAt <= now : false;
  const daysLeft = expiresAt
    ? Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
    : null;
  const warning = !expired && daysLeft != null && daysLeft <= PASSWORD_WARNING_DAYS;
  return {
    password_changed_at: changedAt ? changedAt.toISOString() : null,
    password_expires_at: expiresAt ? expiresAt.toISOString() : null,
    password_expired: expired,
    password_expiring_soon: warning,
    password_days_remaining: daysLeft,
    must_change_password: Boolean(admin.must_change_password) || expired,
  };
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_EXPIRY_DAYS,
  PASSWORD_WARNING_DAYS,
  validatePassword,
  computeExpiry,
  passwordStatus,
};
