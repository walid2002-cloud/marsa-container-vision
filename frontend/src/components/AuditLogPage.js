import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import { getAuditLogs, getAuditStats } from '../services/api';
import './SecurityPages.css';

const EMPTY_FILTERS = { action: '', status: '', resource_type: '', actor: '', method: '', path: '', date: '' };

function statusBadge(status) {
  if (status === 'failure') return 'sec-badge--off';
  if (status === 'success') return 'sec-badge--ok';
  return 'sec-badge--muted';
}

function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const active = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) active[k] = v; });
      const [lRes, sRes] = await Promise.all([getAuditLogs(active), getAuditStats()]);
      if (lRes.success) setLogs(lRes.data);
      if (sRes.success) setStats(sRes.data);
    } catch (e) {
      setMessage(e.response?.data?.error || "Impossible de charger le journal d'audit.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />
        <section className="mcv-section-card">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128220;</span>
              Journal d'audit
            </h2>
          </div>

          {message && <div className="sec-message">{message}</div>}

          {stats && (
            <div className="sec-stats">
              <div className="sec-stat"><span className="sec-stat-num">{stats.total}</span><span>Total</span></div>
              <div className="sec-stat"><span className="sec-stat-num">{stats.success}</span><span>Succès</span></div>
              <div className="sec-stat sec-stat--warn"><span className="sec-stat-num">{stats.failure}</span><span>Échecs</span></div>
              <div className="sec-stat"><span className="sec-stat-num">{stats.last24h}</span><span>Dernières 24h</span></div>
            </div>
          )}

          <div className="sec-filters">
            <input placeholder="Action" value={filters.action} onChange={(e) => setFilter('action', e.target.value)} />
            <input placeholder="Utilisateur" value={filters.actor} onChange={(e) => setFilter('actor', e.target.value)} />
            <input placeholder="Ressource" value={filters.resource_type} onChange={(e) => setFilter('resource_type', e.target.value)} />
            <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Tous statuts</option>
              <option value="success">Succès</option>
              <option value="failure">Échec</option>
            </select>
            <select value={filters.method} onChange={(e) => setFilter('method', e.target.value)}>
              <option value="">Toutes méthodes</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
            <input placeholder="Chemin API" value={filters.path} onChange={(e) => setFilter('path', e.target.value)} />
            <input type="date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
            <button className="sec-btn" onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser</button>
          </div>

          {loading ? (
            <div className="sec-loading"><span className="spinner" /> Chargement…</div>
          ) : (
            <div className="sec-table-wrap">
              <table className="sec-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Utilisateur</th><th>Action</th><th>Ressource</th>
                    <th>Méthode</th><th>Statut</th><th>IP</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && (
                    <tr><td colSpan={8} className="sec-empty">Aucune entrée d'audit.</td></tr>
                  )}
                  {logs.map((l) => (
                    <React.Fragment key={l.id}>
                      <tr>
                        <td>{new Date(l.created_at).toLocaleString('fr-FR')}</td>
                        <td>{l.actor || '—'}</td>
                        <td><code>{l.action}</code></td>
                        <td>{l.resource_type ? `${l.resource_type}${l.resource_id ? ' #' + l.resource_id : ''}` : '—'}</td>
                        <td>{l.method || '—'}</td>
                        <td><span className={`sec-badge ${statusBadge(l.status)}`}>{l.status || '—'}</span></td>
                        <td className="sec-ip">{l.ip_address || '—'}</td>
                        <td>
                          {l.details && (
                            <button className="sec-btn sec-btn--sm" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                              {expanded === l.id ? 'Masquer' : 'Détails'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded === l.id && l.details && (
                        <tr className="sec-detail-row">
                          <td colSpan={8}>
                            <pre className="sec-detail">{JSON.stringify(l.details, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default AuditLogPage;
