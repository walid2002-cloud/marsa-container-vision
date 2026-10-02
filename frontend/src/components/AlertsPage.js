import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import {
  getAlerts,
  getAlertStats,
  runAlertCheck,
  resolveAlert,
  ignoreAlert,
  sendAlertNotification,
} from '../services/api';
import { resolveAiAssetUrl } from '../utils/detectionDisplay';
import {
  alertTypeLabel,
  severityLabel,
  statusLabel,
  formatAlertDate,
  ALERT_TYPE_LABELS,
} from '../utils/alertDisplay';
import './AlertsPage.css';

const EMPTY_FILTERS = { type: '', severity: '', status: 'active', container_code: '', zone: '', date: '' };

function AlertsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(location.search);
    return {
      ...EMPTY_FILTERS,
      zone: params.get('zone') || '',
      container_code: params.get('code') || params.get('container_code') || '',
      type: params.get('type') || '',
    };
  });
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const active = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) active[k] = v; });
      const [alertsRes, statsRes] = await Promise.all([getAlerts(active), getAlertStats()]);
      if (alertsRes.success) setAlerts(alertsRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch {
      setMessage('Impossible de charger les alertes.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleCheck = async () => {
    try {
      setChecking(true);
      setMessage(null);
      const res = await runAlertCheck();
      if (res.success) {
        setMessage(`Vérification terminée : ${res.data.total_created} nouvelle(s) alerte(s).`);
        await load();
      }
    } catch {
      setMessage('La vérification a échoué.');
    } finally {
      setChecking(false);
    }
  };

  const handleResolve = async (id) => {
    setBusyId(id);
    try { await resolveAlert(id); await load(); } catch { /* noop */ } finally { setBusyId(null); }
  };

  const handleIgnore = async (id) => {
    setBusyId(id);
    try { await ignoreAlert(id); await load(); } catch { /* noop */ } finally { setBusyId(null); }
  };

  const handleNotify = async (id) => {
    setBusyId(id);
    try {
      const res = await sendAlertNotification(id);
      setMessage(`Notification envoyée : ${res.count} canal/canaux.`);
      await load();
    } catch { setMessage('Envoi de notification impossible.'); } finally { setBusyId(null); }
  };

  const goToMap = (a) => {
    const params = new URLSearchParams();
    if (a.zone) params.set('zone', a.zone);
    if (a.camera_id || a.camera_name) params.set('camera', a.camera_id || a.camera_name);
    if (a.container_code) params.set('code', a.container_code);
    navigate(`/terminal-map?${params.toString()}`);
  };

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />

        <section className="mcv-section-card">
          <div className="mcv-section-header alerts-header">
            <div>
              <h2 className="section-title">
                <span className="mcv-section-icon" aria-hidden="true">&#128680;</span>
                Alertes intelligentes
              </h2>
              <p className="section-description">
                Détection automatique des situations importantes : positions anciennes, immobilisations,
                OCR incertain, mauvaise zone, conteneurs surveillés, caméras et service IA.
              </p>
            </div>
            <button type="button" className="mcv-btn mcv-btn--primary alerts-check-btn" onClick={handleCheck} disabled={checking}>
              {checking ? 'Vérification…' : '\u21BB Lancer une vérification'}
            </button>
          </div>

          {stats && (
            <div className="alerts-stats">
              <div className="alerts-stat"><span className="alerts-stat-value">{stats.total}</span><span className="alerts-stat-label">Total</span></div>
              <div className="alerts-stat alerts-stat--active"><span className="alerts-stat-value">{stats.active}</span><span className="alerts-stat-label">Actives</span></div>
              <div className="alerts-stat alerts-stat--critical"><span className="alerts-stat-value">{stats.critical}</span><span className="alerts-stat-label">Critiques</span></div>
              <div className="alerts-stat alerts-stat--warning"><span className="alerts-stat-value">{stats.warning}</span><span className="alerts-stat-label">Avertissements</span></div>
              <div className="alerts-stat alerts-stat--info"><span className="alerts-stat-value">{stats.info}</span><span className="alerts-stat-label">Info</span></div>
              <div className="alerts-stat alerts-stat--resolved"><span className="alerts-stat-value">{stats.resolved}</span><span className="alerts-stat-label">Traitées</span></div>
            </div>
          )}

          {message && <div className="alerts-message" role="status">{message}</div>}

          <div className="alerts-filters">
            <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Tous les statuts</option>
              <option value="active">Actives</option>
              <option value="resolved">Traitées</option>
              <option value="ignored">Ignorées</option>
            </select>
            <select value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)}>
              <option value="">Toutes gravités</option>
              <option value="critical">Critique</option>
              <option value="warning">Avertissement</option>
              <option value="info">Info</option>
            </select>
            <select value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
              <option value="">Tous les types</option>
              {Object.keys(ALERT_TYPE_LABELS).map((t) => (
                <option key={t} value={t}>{alertTypeLabel(t)}</option>
              ))}
            </select>
            <input type="text" placeholder="Conteneur" value={filters.container_code} onChange={(e) => setFilter('container_code', e.target.value)} />
            <input type="text" placeholder="Zone" value={filters.zone} onChange={(e) => setFilter('zone', e.target.value)} />
            <input type="date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
            <button type="button" className="alerts-reset" onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser</button>
          </div>

          {loading ? (
            <div className="mcv-progress-banner" role="status"><span className="spinner" aria-hidden="true" /> Chargement…</div>
          ) : alerts.length === 0 ? (
            <p className="alerts-empty">Aucune alerte pour ces critères.</p>
          ) : (
            <ul className="alerts-list">
              {alerts.map((a) => (
                <li key={a.id} className={`alert-card alert-card--${a.severity} alert-card--${a.status}`}>
                  <div className="alert-card-main">
                    <div className="alert-card-badges">
                      <span className={`alert-badge alert-badge--${a.severity}`}>{severityLabel(a.severity)}</span>
                      <span className="alert-badge alert-badge--type">{alertTypeLabel(a.type)}</span>
                      <span className={`alert-badge alert-badge--status-${a.status}`}>{statusLabel(a.status)}</span>
                    </div>
                    <p className="alert-card-message">{a.message}</p>
                    <div className="alert-card-meta">
                      {a.container_code && <span><strong>Conteneur :</strong> {a.container_code}</span>}
                      {a.camera_name && <span><strong>Caméra :</strong> {a.camera_name}</span>}
                      {a.zone && <span><strong>Zone :</strong> {a.zone}</span>}
                      <span><strong>Créée :</strong> {formatAlertDate(a.created_at)}</span>
                      {a.resolved_at && <span><strong>Traitée :</strong> {formatAlertDate(a.resolved_at)} {a.resolved_by ? `(${a.resolved_by})` : ''}</span>}
                    </div>
                    {a.type === 'OCR_SUSPICIOUS' && a.details && (
                      <div className="alert-card-ocr">
                        {a.details.ocr_quality && (
                          <span className="alert-ocr-chip alert-ocr-chip--quality">Qualité OCR : {a.details.ocr_quality}</span>
                        )}
                        {a.details.partial_code_detected && (
                          <span className="alert-ocr-chip alert-ocr-chip--partial">Code partiel</span>
                        )}
                        {a.details.matched_code && (
                          <span className="alert-ocr-chip">Code : {a.details.matched_code}</span>
                        )}
                        {a.details.match_score != null && (
                          <span className="alert-ocr-chip">Score : {Math.round(Number(a.details.match_score) * 100)}%</span>
                        )}
                        {a.details.raw_ocr_text && (
                          <span className="alert-ocr-raw" title={a.details.raw_ocr_text}>
                            OCR : {String(a.details.raw_ocr_text).slice(0, 60)}{String(a.details.raw_ocr_text).length > 60 ? '…' : ''}
                          </span>
                        )}
                      </div>
                    )}
                    {a.notifications && a.notifications.length > 0 && (
                      <div className="alert-card-notifs">
                        <span className="alert-card-notifs-label">Notifications :</span>
                        {a.notifications.map((n) => (
                          <span key={n.id} className={`alert-notif-chip alert-notif-chip--${n.status}`} title={n.error_message || ''}>
                            {n.channel} · {n.status}{n.simulated ? ' (sim)' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {a.proof_image_url && (
                    <a className="alert-card-proof" href={resolveAiAssetUrl(a.proof_image_url)} target="_blank" rel="noreferrer">
                      <img src={resolveAiAssetUrl(a.proof_image_url)} alt="Preuve" onError={(e) => { e.target.style.display = 'none'; }} />
                    </a>
                  )}

                  <div className="alert-card-actions">
                    {a.status === 'active' && (
                      <>
                        <button type="button" className="alert-action alert-action--resolve" onClick={() => handleResolve(a.id)} disabled={busyId === a.id}>Traiter</button>
                        <button type="button" className="alert-action alert-action--ignore" onClick={() => handleIgnore(a.id)} disabled={busyId === a.id}>Ignorer</button>
                      </>
                    )}
                    {(a.zone || a.camera_id) && (
                      <button type="button" className="alert-action alert-action--map" onClick={() => goToMap(a)}>Voir sur la carte</button>
                    )}
                    <button type="button" className="alert-action alert-action--notify" onClick={() => handleNotify(a.id)} disabled={busyId === a.id}>
                      {a.notifications && a.notifications.length > 0 ? 'Renvoyer notif.' : 'Notifier'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>Marsa Container Vision &mdash; Marsa Maroc &copy; 2026</p>
      </footer>
    </>
  );
}

export default AlertsPage;
