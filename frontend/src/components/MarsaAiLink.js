import React, { useCallback, useEffect, useState } from 'react';
import { checkMarsaAiAvailable, openMarsaMarocAiSync, resolveMarsaAiUrl } from '../utils/marsaAiNav';

function MarsaAiLink({ url }) {
  const [status, setStatus] = useState('unknown');
  const [msg, setMsg] = useState(null);
  const resolved = resolveMarsaAiUrl(url);

  useEffect(() => {
    if (!resolved) {
      setStatus('unconfigured');
      return;
    }
    let cancelled = false;
    checkMarsaAiAvailable(resolved).then((r) => {
      if (!cancelled) setStatus(r.available ? 'online' : 'offline');
    });
    return () => { cancelled = true; };
  }, [resolved]);

  const handleClick = useCallback((e) => {
    e.preventDefault();
    setMsg(null);
    if (!resolved) {
      setMsg('Marsa Maroc AI indisponible');
      return;
    }
    const result = openMarsaMarocAiSync(resolved);
    if (!result.ok) {
      setMsg(result.error || 'Marsa Maroc AI indisponible');
    }
  }, [resolved]);

  if (!resolved) return null;

  return (
    <span className="marsa-ai-link-wrap">
      <button
        type="button"
        className={`header-marsa-ai-link ${status === 'offline' ? 'header-marsa-ai-link--offline' : ''}`}
        onClick={handleClick}
        title={status === 'online' ? 'Ouvrir Marsa Maroc AI' : 'Marsa Maroc AI indisponible — démarrez le projet marsamaroc (port 5173)'}
      >
        <span aria-hidden="true">🤖</span> Marsa Maroc AI
      </button>
      {msg && <span className="marsa-ai-link-msg" role="alert">{msg}</span>}
    </span>
  );
}

export default MarsaAiLink;
