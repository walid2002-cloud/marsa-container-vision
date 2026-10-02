import React, { useEffect, useState } from 'react';
import Header from './Header';
import { getSessions, revokeSession } from '../services/api';
import './SecurityPages.css';

function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const res = await getSessions();
      if (res.success) setSessions(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRevoke = async (id) => {
    try {
      await revokeSession(id);
      setMsg('Session révoquée.');
      load();
    } catch {
      setMsg('Impossible de révoquer la session.');
    }
  };

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <section className="mcv-section-card">
          <h2 className="section-title">Sessions actives</h2>
          <p className="section-description">Refresh tokens émis pour votre compte.</p>
          {msg && <div className="success-banner">{msg}</div>}
          {loading ? <p>Chargement…</p> : (
            <table className="sec-table">
              <thead>
                <tr><th>Créée</th><th>Expire</th><th>Statut</th><th></th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.created_at).toLocaleString('fr-FR')}</td>
                    <td>{new Date(s.expires_at).toLocaleString('fr-FR')}</td>
                    <td>{s.active ? 'Active' : 'Révoquée / expirée'}</td>
                    <td>
                      {s.active && (
                        <button type="button" className="sec-btn sec-btn--ghost" onClick={() => handleRevoke(s.id)}>
                          Révoquer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}

export default SessionsPage;
