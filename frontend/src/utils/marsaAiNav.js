/**
 * Navigation vers Marsa Maroc AI (frontend Vite, port par défaut 5173).
 * Ne jamais coder l'URL en dur — utiliser REACT_APP_MARSA_AI_URL / settings API.
 */

export function resolveMarsaAiUrl(settingsUrl) {
  return (settingsUrl || process.env.REACT_APP_MARSA_AI_URL || '').replace(/\/$/, '');
}

export async function checkMarsaAiAvailable(baseUrl) {
  const root = resolveMarsaAiUrl(baseUrl);
  if (!root) return { available: false, reason: 'URL non configurée' };

  const candidates = [`${root}/api/health`, root];
  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (res.ok) return { available: true, url: root };
    } catch {
      /* essai suivant */
    }
  }
  return { available: false, url: root, reason: 'Marsa Maroc AI indisponible' };
}

/** Ouverture synchrone — évite le blocage pop-up Safari après un await. */
export function openMarsaMarocAiSync(baseUrl) {
  const target = resolveMarsaAiUrl(baseUrl);
  if (!target) {
    return { ok: false, error: 'Marsa Maroc AI indisponible' };
  }
  const opened = window.open(target, '_blank', 'noopener,noreferrer');
  if (opened) {
    return { ok: true, target };
  }
  window.location.assign(target);
  return { ok: true, target, sameTab: true };
}

export async function openMarsaMarocAi(baseUrl, { sameTab = false } = {}) {
  const target = resolveMarsaAiUrl(baseUrl);
  if (!target) {
    const err = new Error('Marsa Maroc AI indisponible');
    err.code = 'MARSA_AI_UNAVAILABLE';
    throw err;
  }
  if (sameTab) {
    window.location.assign(target);
  } else {
    const opened = window.open(target, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(target);
  }
  return target;
}
