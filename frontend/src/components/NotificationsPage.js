import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import {
  getOutboundNotifications,
  getOutboundNotificationStats,
  retryNotification,
  getNotificationSettings,
  updateNotificationSettings,
} from '../services/api';
import { alertTypeLabel, formatAlertDate } from '../utils/alertDisplay';
import './NotificationsPage.css';

const CHANNEL_LABELS = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS' };
const STATUS_LABELS = { sent: 'Envoyée', failed: 'Échouée', pending: 'En attente', skipped: 'Ignorée' };

const EMPTY_FILTERS = { channel: '', status: '', alert_type: '', recipient: '', date: '' };

function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState([]);
  const [simulationMode, setSimulationMode] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const active = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) active[k] = v; });
      const [nRes, sRes, setRes] = await Promise.all([
        getOutboundNotifications(active),
        getOutboundNotificationStats(),
        getNotificationSettings(),
      ]);
      if (nRes.success) setNotifications(nRes.data);
      if (sRes.success) setStats(sRes.data);
      if (setRes.success) {
        setSettings(setRes.data);
        setSimulationMode(setRes.simulation_mode);
        setNotifEnabled(setRes.notifications_enabled);
      }
    } catch {
      setMessage('Impossible de charger les notifications.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleRetry = async (id) => {
    setBusyId(id);
    try { await retryNotification(id); await load(); } catch { /* noop */ } finally { setBusyId(null); }
  };

  const toggleChannel = async (channel, enabled) => {
    try {
      await updateNotificationSettings({ channel, enabled });
      await load();
    } catch { setMessage('Mise à jour du canal impossible.'); }
  };

  const saveRecipient = async (channel, default_recipient) => {
    try {
      await updateNotificationSettings({ channel, default_recipient });
      setMessage(`Destinataire ${CHANNEL_LABELS[channel]} mis à jour.`);
      await load();
    } catch { setMessage('Mise à jour du destinataire impossible.'); }
  };

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />

        <section className="mcv-section-card">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128233;</span>
              Notifications multi-canal
            </h2>
            <p className="section-description">
              Notifications WhatsApp, Email et SMS déclenchées par les alertes intelligentes.
              {simulationMode && <strong> Mode simulation actif — aucun envoi réel.</strong>}
            </p>
          </div>

          {stats && (
            <div className="notif-stats">
              <div className="notif-stat"><span className="notif-stat-value">{stats.total}</span><span className="notif-stat-label">Total</span></div>
              <div className="notif-stat notif-stat--sent"><span className="notif-stat-value">{stats.sent}</span><span className="notif-stat-label">Envoyées</span></div>
              <div className="notif-stat notif-stat--failed"><span className="notif-stat-value">{stats.failed}</span><span className="notif-stat-label">Échouées</span></div>
              <div className="notif-stat notif-stat--pending"><span className="notif-stat-value">{stats.pending}</span><span className="notif-stat-label">En attente</span></div>
              <div className="notif-stat notif-stat--skip"><span className="notif-stat-value">{stats.skipped}</span><span className="notif-stat-label">Ignorées</span></div>
              <div className="notif-stat notif-stat--sim"><span className="notif-stat-value">{stats.simulated}</span><span className="notif-stat-label">Simulées</span></div>
              <div className="notif-stat"><span className="notif-stat-value">{stats.sent_today}</span><span className="notif-stat-label">Aujourd&apos;hui</span></div>
            </div>
          )}

          {message && <div className="alerts-message" role="status">{message}</div>}
        </section>

        {/* Paramètres des canaux */}
        <section className="mcv-section-card">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#9881;</span>
              Paramètres des canaux
            </h2>
            <p className="section-description">
              État global : {notifEnabled ? 'Notifications activées' : 'Notifications désactivées'} —
              {simulationMode ? ' Simulation' : ' Envoi réel'}. Les tokens/secrets ne sont jamais affichés.
            </p>
          </div>
          <div className="notif-settings">
            {settings.map((s) => (
              <div key={s.channel} className="notif-setting">
                <div className="notif-setting-head">
                  <span className="notif-setting-name">{CHANNEL_LABELS[s.channel] || s.channel}</span>
                  <label className="notif-switch">
                    <input type="checkbox" checked={s.enabled} onChange={(e) => toggleChannel(s.channel, e.target.checked)} />
                    <span>{s.enabled ? 'Activé' : 'Désactivé'}</span>
                  </label>
                </div>
                <div className="notif-setting-meta">Provider : <strong>{s.provider}</strong></div>
                <div className="notif-setting-recipient">
                  <input
                    type="text"
                    defaultValue={s.default_recipient || ''}
                    placeholder="Destinataire par défaut"
                    onBlur={(e) => { if (e.target.value !== (s.default_recipient || '')) saveRecipient(s.channel, e.target.value); }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Liste des notifications */}
        <section className="mcv-section-card">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128220;</span>
              Historique des notifications
            </h2>
          </div>

          <div className="alerts-filters">
            <select value={filters.channel} onChange={(e) => setFilter('channel', e.target.value)}>
              <option value="">Tous les canaux</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
            <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Tous les statuts</option>
              <option value="sent">Envoyée</option>
              <option value="failed">Échouée</option>
              <option value="pending">En attente</option>
              <option value="skipped">Ignorée</option>
            </select>
            <input type="text" placeholder="Type d'alerte" value={filters.alert_type} onChange={(e) => setFilter('alert_type', e.target.value)} />
            <input type="text" placeholder="Destinataire" value={filters.recipient} onChange={(e) => setFilter('recipient', e.target.value)} />
            <input type="date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
            <button type="button" className="alerts-reset" onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser</button>
          </div>

          {loading ? (
            <div className="mcv-progress-banner" role="status"><span className="spinner" aria-hidden="true" /> Chargement…</div>
          ) : notifications.length === 0 ? (
            <p className="alerts-empty">Aucune notification pour ces critères.</p>
          ) : (
            <ul className="notif-list">
              {notifications.map((n) => (
                <li key={n.id} className={`notif-card notif-card--${n.status}`}>
                  <div className="notif-card-main">
                    <div className="notif-card-badges">
                      <span className={`notif-badge notif-badge--channel-${n.channel}`}>{CHANNEL_LABELS[n.channel] || n.channel}</span>
                      <span className={`notif-badge notif-badge--status-${n.status}`}>{STATUS_LABELS[n.status] || n.status}</span>
                      {n.simulated && <span className="notif-badge notif-badge--sim">Simulation</span>}
                      {n.alert_type && <span className="notif-badge notif-badge--type">{alertTypeLabel(n.alert_type)}</span>}
                    </div>
                    <p className="notif-card-message">{n.message}</p>
                    <div className="notif-card-meta">
                      <span><strong>Destinataire :</strong> {n.recipient || '—'}</span>
                      <span><strong>Provider :</strong> {n.provider || '—'}</span>
                      {n.alert_id && <span><strong>Alerte :</strong> #{n.alert_id}</span>}
                      <span><strong>Créée :</strong> {formatAlertDate(n.created_at)}</span>
                      {n.sent_at && <span><strong>Envoyée :</strong> {formatAlertDate(n.sent_at)}</span>}
                    </div>
                    {n.status === 'failed' && n.error_message && (
                      <p className="notif-card-error">Erreur : {n.error_message}</p>
                    )}
                  </div>
                  <div className="notif-card-actions">
                    {(n.status === 'failed' || n.status === 'pending') && (
                      <button type="button" className="alert-action alert-action--resolve" onClick={() => handleRetry(n.id)} disabled={busyId === n.id}>
                        {busyId === n.id ? '…' : 'Réessayer'}
                      </button>
                    )}
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

export default NotificationsPage;
