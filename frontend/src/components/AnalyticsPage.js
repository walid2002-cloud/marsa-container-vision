import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import Header from './Header';
import CountUp from './CountUp';
import { getAnalyticsSummary, getNotifications, getOutboundNotificationStats, getSystemStatus } from '../services/api';
import { resolveAiAssetUrl } from '../utils/detectionDisplay';
import './AnalyticsPage.css';

function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Bar({ label, value, max = 1, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="an-bar">
      <div className="an-bar-label" title={label}>{formatShortDate(label)}</div>
      <div className="an-bar-track">
        <div className="an-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="an-bar-val">{typeof value === 'number' ? value.toFixed(value < 2 ? 2 : 0) : value}</div>
    </div>
  );
}

function ResultBadge({ result }) {
  const detected = result === 'detected';
  return (
    <span className={`mcv-badge ${detected ? 'mcv-badge--success' : 'mcv-badge--warning'}`}>
      <span className="mcv-badge-dot" aria-hidden="true" />
      {detected ? 'Détecté' : 'Non détecté'}
    </span>
  );
}

const KPI_CONFIG = [
  { key: 'totalSearches', label: 'Recherches', icon: '📊', iconClass: 'mcv-kpi-icon--blue', sub: '30 derniers jours', isPercent: false },
  { key: 'detectedCount', label: 'Conteneurs détectés', icon: '✅', iconClass: 'mcv-kpi-icon--green', sub: 'présences confirmées', isPercent: false },
  { key: 'ocrSuccessRate', label: 'Taux succès OCR', icon: '🎯', iconClass: 'mcv-kpi-icon--cyan', sub: 'détections / recherches', isPercent: true, showBar: true },
  { key: 'avgGlobalConfidence', label: 'Confiance moyenne', icon: '⚡', iconClass: 'mcv-kpi-icon--purple', sub: 'score global', isPercent: true },
  { key: 'activeCameras', label: 'Caméras actives', icon: '📹', iconClass: 'mcv-kpi-icon--orange', sub: 'simulation locale', isPercent: false },
  { key: 'imageScans', label: 'Scans image/vidéo', icon: '🖼', iconClass: 'mcv-kpi-icon--blue', sub: 'upload + live cameras', isPercent: false },
];

// Phase 7 : indicateurs opérationnels complémentaires.
const SECONDARY_KPI = [
  { key: 'detectedToday', label: 'Détectés aujourd\'hui', icon: '📅' },
  { key: 'containersToVerify', label: 'Position à vérifier', icon: '⏳' },
  { key: 'activeAlerts', label: 'Alertes actives', icon: '🚨' },
  { key: 'criticalAlerts', label: 'Alertes critiques', icon: '⛔' },
  { key: 'notificationsSent', label: 'Notifications envoyées', icon: '📤' },
  { key: 'notificationsFailed', label: 'Notifications échouées', icon: '⚠️' },
  { key: 'ocrToVerify', label: 'Codes OCR à vérifier', icon: '🔎' },
];

const SERVICE_LABELS = {
  backend: 'Backend API',
  database: 'Base de données',
  ai_service: 'Service IA',
  camera_simulation: 'Simulation caméra',
  terminal_map: 'Carte terminal',
  alerts: 'Alertes',
  notifications: 'Notifications',
  storage: 'Stockage preuves',
  integration_api: 'API intégration',
};

function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notifStats, setNotifStats] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [live, setLive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, n, ns, sys] = await Promise.all([
        getAnalyticsSummary(),
        getNotifications(30),
        getOutboundNotificationStats().catch(() => null),
        getSystemStatus().catch(() => null),
      ]);
      if (s.success) setSummary(s.data);
      if (n.success) setNotifications(n.data);
      if (ns && ns.success) setNotifStats(ns.data);
      if (sys && sys.success) setSystemStatus(sys.data);
      setErr(null);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('detection_update', (payload) => {
      setLive((prev) => [{ t: new Date().toISOString(), ...payload }, ...prev].slice(0, 25));
    });
    return () => socket.disconnect();
  }, []);

  const daily = summary?.detectionsPerDay || [];
  const maxDaily = Math.max(1, ...daily.map((d) => d.count));

  const getKpiValue = (key) => {
    if (!summary) return 0;
    if (key === 'avgGlobalConfidence') {
      return summary.avgGlobalConfidence != null ? summary.avgGlobalConfidence * 100 : null;
    }
    if (key === 'ocrSuccessRate') return summary.ocrSuccessRate * 100;
    return summary[key];
  };

  return (
    <>
      <Header />
      <main className="main-content main-content--wide an-page mcv-page">
        <div className="an-hero">
          <h2 className="section-title">Tableau de bord analytique</h2>
          <p className="section-description">
            Vue d&apos;ensemble pour la soutenance : recherches, détections, confiance OCR,
            caméras simulées et derniers résultats exploitables par le bot WhatsApp.
          </p>
        </div>
        <p className="mcv-hint-box an-hint">
          Mode simulation : pas de RTSP réel. Les indicateurs agrègent l&apos;historique des recherches,
          uploads et scans caméra des 30 derniers jours.
        </p>

        {err && (
          <div className="error-banner" role="alert">
            <span className="error-icon">&#9888;</span> {err}
          </div>
        )}

        {loading && (
          <div className="app-loading app-loading--inline">
            <span className="spinner" aria-hidden="true" />
            Chargement des statistiques…
          </div>
        )}

        {summary && !loading && (
          <div className="mcv-kpi-grid mcv-stagger">
            {KPI_CONFIG.map((cfg) => {
              const raw = getKpiValue(cfg.key);
              const displayNull = raw == null;
              return (
                <div key={cfg.key} className="mcv-kpi-card">
                  <div className="mcv-kpi-card-head">
                    <h3>{cfg.label}</h3>
                    <span className={`mcv-kpi-icon ${cfg.iconClass}`} aria-hidden="true">{cfg.icon}</span>
                  </div>
                  <p className="mcv-kpi-value">
                    {displayNull ? (
                      '—'
                    ) : cfg.isPercent ? (
                      <CountUp value={raw} decimals={1} suffix="%" />
                    ) : (
                      <CountUp value={raw} />
                    )}
                  </p>
                  {cfg.sub && <span className="mcv-kpi-sub">{cfg.sub}</span>}
                  {cfg.showBar && summary.ocrSuccessRate != null && (
                    <div className="an-kpi-bar">
                      <Bar label="" value={summary.ocrSuccessRate} max={1} color="#16a34a" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {summary && !loading && (
          <section className="an-section mcv-section-card">
            <h3 className="an-section-title">Indicateurs opérationnels</h3>
            <div className="an-mini-grid">
              {SECONDARY_KPI.map((k) => (
                <div key={k.key} className="an-mini-stat">
                  <span className="an-mini-icon" aria-hidden="true">{k.icon}</span>
                  <span className="an-mini-value">{summary[k.key] ?? 0}</span>
                  <span className="an-mini-label">{k.label}</span>
                </div>
              ))}
              <div className="an-mini-stat">
                <span className="an-mini-icon" aria-hidden="true">🕒</span>
                <span className="an-mini-value an-mini-value--sm">{formatDateTime(summary.lastDetectionAt)}</span>
                <span className="an-mini-label">Dernière détection</span>
              </div>
            </div>
          </section>
        )}

        {systemStatus && !loading && (
          <section className="an-section mcv-section-card">
            <div className="an-live-header">
              <h3 className="an-section-title">État des services</h3>
              <span className={`an-svc-badge an-svc-badge--${systemStatus.overall}`}>
                {systemStatus.overall === 'healthy' ? 'Tous opérationnels'
                  : systemStatus.overall === 'degraded' ? 'Dégradé' : 'Incident'}
              </span>
            </div>
            <div className="an-svc-grid">
              {Object.entries(systemStatus.services).map(([key, s]) => (
                <div key={key} className={`an-svc-card an-svc-card--${s.status}`}>
                  <div className="an-svc-top">
                    <span className={`an-svc-dot an-svc-dot--${s.status}`} aria-hidden="true" />
                    <strong>{SERVICE_LABELS[key] || key}</strong>
                  </div>
                  <span className="an-svc-status">{s.status}</span>
                  <p className="an-svc-msg">{s.message}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {summary && (
          <section className="an-section mcv-section-card">
            <h3 className="an-section-title">Détections par jour</h3>
            {daily.length === 0 ? (
              <div className="mcv-empty an-empty-inline">
                <span className="mcv-empty-icon" aria-hidden="true">📈</span>
                <strong>Aucune donnée disponible</strong>
                <p>Les informations apparaîtront après les premières analyses.</p>
              </div>
            ) : (
              <div className="an-bars">
                {daily.map((d) => (
                  <Bar key={d.date} label={d.date} value={d.count} max={maxDaily} color="#2563eb" />
                ))}
              </div>
            )}
          </section>
        )}

        {summary?.ocrConfidenceByDay?.length > 0 && (
          <section className="an-section mcv-section-card">
            <h3 className="an-section-title">Confiance OCR moyenne (détections positives)</h3>
            <div className="an-bars">
              {summary.ocrConfidenceByDay.map((d) => (
                <Bar key={d.date} label={d.date} value={d.avgOcr} max={1} color="#6366f1" />
              ))}
            </div>
          </section>
        )}

        <section className="an-section mcv-section-card">
          <h3 className="an-section-title">Images récentes</h3>
          {summary?.recentDetectionsWithImages?.length > 0 ? (
            <div className="an-thumbs mcv-stagger">
              {summary.recentDetectionsWithImages.map((row) => {
                const p = row.annotated_path || row.image_path;
                const fixed = resolveAiAssetUrl(p);
                return (
                  <figure key={`${row.src || 'row'}-${row.id}-${row.detected_at}`} className="an-thumb">
                    <div className="an-thumb-img mcv-img-zoom">
                      {fixed ? (
                        <img
                          src={fixed}
                          alt={row.container_code}
                          loading="lazy"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            const ph = e.target.nextSibling;
                            if (ph) ph.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className="an-thumb-ph" style={{ display: fixed ? 'none' : 'flex' }}>
                        <span aria-hidden="true">&#128247;</span>
                      </div>
                    </div>
                    <figcaption>{row.container_code}</figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <div className="mcv-empty an-empty-inline">
              <span className="mcv-empty-icon" aria-hidden="true">&#128247;</span>
              <strong>Aucune image récente</strong>
              <p>Les captures de détection s&apos;afficheront ici après les premières analyses.</p>
            </div>
          )}
        </section>

        <div className="an-section an-two-col">
          <section className="mcv-section-card">
            <h3 className="an-section-title">Historique récent</h3>
            {(summary?.recentSearches || []).length === 0 ? (
              <div className="mcv-empty an-empty-inline">
                <strong>Aucune recherche récente</strong>
                <p>Effectuez une recherche pour alimenter l&apos;historique.</p>
              </div>
            ) : (
              <div className="mcv-table-wrap">
                <table className="mcv-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Code</th>
                      <th>Résultat</th>
                      <th>Global</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.recentSearches || []).map((r) => (
                      <tr key={r.id}>
                        <td>{formatDateTime(r.searched_at)}</td>
                        <td className="an-code">{r.searched_code}</td>
                        <td><ResultBadge result={r.result} /></td>
                        <td>
                          {r.global_confidence != null
                            ? `${(Number(r.global_confidence) * 100).toFixed(0)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {summary?.ocrQuality && (
            <section className="mcv-section-card">
              <h3 className="an-section-title">Qualité OCR (Phase 5)</h3>
              <div className="an-notif-stats">
                <div className="an-notif-stat"><span className="an-notif-stat-value">{summary.ocrQuality.bon || 0}</span><span className="an-notif-stat-label">OCR bon</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{summary.ocrQuality.moyen || 0}</span><span className="an-notif-stat-label">OCR moyen</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{summary.ocrQuality.faible || 0}</span><span className="an-notif-stat-label">OCR faible</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{summary.ocrQuality['à vérifier'] || 0}</span><span className="an-notif-stat-label">À vérifier</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{summary.ocrAlerts?.ocr_suspicious || 0}</span><span className="an-notif-stat-label">Alertes OCR actives</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{summary.ocrAlerts?.ai_errors || 0}</span><span className="an-notif-stat-label">Erreurs IA récentes</span></div>
              </div>
            </section>
          )}

          {notifStats && (
            <section className="mcv-section-card">
              <h3 className="an-section-title">Notifications (multi-canal)</h3>
              <div className="an-notif-stats">
                <div className="an-notif-stat"><span className="an-notif-stat-value">{notifStats.sent_today}</span><span className="an-notif-stat-label">Envoyées aujourd&apos;hui</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{notifStats.failed}</span><span className="an-notif-stat-label">Échouées</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{notifStats.sent}</span><span className="an-notif-stat-label">Total envoyées</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{notifStats.simulated}</span><span className="an-notif-stat-label">Simulées</span></div>
                <div className="an-notif-stat"><span className="an-notif-stat-value">{notifStats.top_channel || '—'}</span><span className="an-notif-stat-label">Canal le + utilisé</span></div>
              </div>
            </section>
          )}

          <section className="mcv-section-card">
            <h3 className="an-section-title">Alertes &amp; notifications</h3>
            {notifications.length === 0 ? (
              <div className="mcv-empty an-empty-inline">
                <span className="mcv-empty-icon" aria-hidden="true">&#128276;</span>
                <strong>Aucune alerte</strong>
                <p>Les notifications système apparaîtront ici.</p>
              </div>
            ) : (
              <ul className="an-notif-list">
                {notifications.map((n) => (
                  <li key={n.id} className="an-notif">
                    <strong>{n.title}</strong>
                    <span className="an-notif-meta">{n.type}</span>
                    <p>{n.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="an-section mcv-section-card">
          <div className="an-live-header">
            <h3 className="an-section-title">Flux temps réel (Socket.IO)</h3>
            <span className="mcv-live-pill">
              <span className="mcv-live-dot" aria-hidden="true" />
              Live
            </span>
          </div>
          <div className="mcv-table-wrap">
            <table className="mcv-table">
              <thead>
                <tr>
                  <th>Heure</th>
                  <th>Code</th>
                  <th>Détecté</th>
                  <th>Caméra</th>
                  <th>Global</th>
                </tr>
              </thead>
              <tbody>
                {live.length === 0 && (
                  <tr>
                    <td colSpan={5} className="mcv-muted">
                      En attente d&apos;événements… Effectuez une recherche conteneur.
                    </td>
                  </tr>
                )}
                {live.map((r, i) => (
                  <tr key={`${r.t}-${i}`}>
                    <td>{new Date(r.t).toLocaleTimeString('fr-FR')}</td>
                    <td className="an-code">{r.searched_code || r.container_code}</td>
                    <td>
                      <span className={`mcv-badge ${r.detected ? 'mcv-badge--success' : 'mcv-badge--warning'}`}>
                        {r.detected ? 'oui' : 'non'}
                      </span>
                    </td>
                    <td>{r.camera_name || '—'}</td>
                    <td>
                      {r.global_confidence != null
                        ? `${(Number(r.global_confidence) * 100).toFixed(0)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

export default AnalyticsPage;
