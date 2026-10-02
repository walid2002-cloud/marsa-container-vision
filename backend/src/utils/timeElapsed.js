/**
 * Calcul du temps écoulé depuis la dernière détection (lisible FR).
 */

const STALE_POSITION_HOURS = Number(process.env.STALE_POSITION_HOURS || 24);

/**
 * @param {Date|string|number|null} date
 * @returns {{ text: string, seconds: number|null, needs_verification: boolean, iso: string|null }}
 */
function formatElapsed(date) {
  if (!date) {
    return { text: 'Jamais détecté', seconds: null, needs_verification: false, iso: null };
  }
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) {
    return { text: 'Date inconnue', seconds: null, needs_verification: false, iso: null };
  }

  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then.getTime()) / 1000));
  const hours = seconds / 3600;
  const needsVerification = hours >= STALE_POSITION_HOURS;

  let text;
  if (seconds < 60) {
    text = 'détecté à l\'instant';
  } else if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    text = `détecté il y a ${m} minute${m > 1 ? 's' : ''}`;
  } else if (hours < 24) {
    const h = Math.floor(hours);
    text = `détecté il y a ${h} heure${h > 1 ? 's' : ''}`;
  } else if (hours < 48) {
    text = 'détecté hier';
  } else {
    const days = Math.floor(hours / 24);
    text = `dernière détection il y a ${days} jour${days > 1 ? 's' : ''}`;
  }

  return {
    text,
    seconds,
    needs_verification: needsVerification,
    iso: then.toISOString(),
  };
}

module.exports = { formatElapsed, STALE_POSITION_HOURS };
