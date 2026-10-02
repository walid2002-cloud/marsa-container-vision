import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import TerminalMap, { resolveZoneIdFromZones } from './TerminalMap';
import { getTerminalMap } from '../services/api';
import { resolveAiAssetUrl } from '../utils/detectionDisplay';
import './TerminalMapPage.css';

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR');
}

function TerminalMapPage() {
  const query = useQuery();
  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedZone, setSelectedZone] = useState(query.get('zone'));

  const focusCode = query.get('code');
  const focusCameraParam = query.get('camera');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getTerminalMap(12);
      if (res.success) {
        setMap(res.data);
      } else {
        setError('Impossible de charger la carte du terminal.');
      }
    } catch {
      setError('Impossible de charger la carte du terminal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const zones = map?.zones || [];
  const cameras = map?.cameras || [];

  // Zone active : depuis le paramètre d'URL (zone directe ou libellé) sinon sélection manuelle.
  const activeZoneId = useMemo(() => {
    if (selectedZone) {
      const direct = zones.find((z) => z.id === selectedZone);
      if (direct) return direct.id;
      return resolveZoneIdFromZones(zones, selectedZone);
    }
    return null;
  }, [selectedZone, zones]);

  const activeCameraId = useMemo(() => {
    if (focusCameraParam) return focusCameraParam;
    if (activeZoneId) {
      const z = zones.find((zz) => zz.id === activeZoneId);
      return z?.camera_id || null;
    }
    return null;
  }, [focusCameraParam, activeZoneId, zones]);

  const recent = map?.recently_detected_containers || [];
  const toVerify = map?.containers_to_verify || [];
  const stats = map?.stats || {};

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />

        <section className="mcv-section-card">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128506;</span>
              Carte du terminal
            </h2>
            <p className="section-description">
              Vue schématique du terminal portuaire : zones, caméras et dernières positions connues
              des conteneurs (données issues du suivi temps réel).
            </p>
          </div>

          {stats.total_zones != null && (
            <div className="tmp-stats">
              <div className="tmp-stat">
                <span className="tmp-stat-value">{stats.total_zones}</span>
                <span className="tmp-stat-label">Zones</span>
              </div>
              <div className="tmp-stat">
                <span className="tmp-stat-value">{stats.active_cameras}</span>
                <span className="tmp-stat-label">Caméras actives</span>
              </div>
              <div className="tmp-stat">
                <span className="tmp-stat-value">{stats.total_tracked}</span>
                <span className="tmp-stat-label">Conteneurs suivis</span>
              </div>
              <div className="tmp-stat tmp-stat--warn">
                <span className="tmp-stat-value">{stats.to_verify}</span>
                <span className="tmp-stat-label">À vérifier</span>
              </div>
              <div className="tmp-stat tmp-stat--alert">
                <span className="tmp-stat-value">{stats.active_alerts ?? 0}</span>
                <span className="tmp-stat-label">Alertes actives</span>
              </div>
            </div>
          )}

          {loading && (
            <div className="mcv-progress-banner" role="status">
              <span className="spinner" aria-hidden="true" /> Chargement de la carte…
            </div>
          )}

          {error && !loading && (
            <div className="error-banner" role="alert">
              <span className="error-icon">&#9888;</span> {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {focusCode && activeZoneId && (
                <div className="tmp-focus-banner">
                  Conteneur <strong>{focusCode}</strong> — dernière zone connue mise en évidence sur la carte.
                </div>
              )}
              <TerminalMap
                zones={zones}
                cameras={cameras}
                activeZoneId={activeZoneId}
                activeCameraId={activeCameraId}
                onZoneClick={(id) => setSelectedZone(id === selectedZone ? null : id)}
              />

              {zones.some((z) => z.active_alerts_count > 0) && (
                <div className="tmp-zone-alerts">
                  <span className="tmp-zone-alerts-title">&#128680; Alertes actives par zone :</span>
                  {zones
                    .filter((z) => z.active_alerts_count > 0)
                    .map((z) => (
                      <Link
                        key={z.id}
                        className="tmp-zone-alert-chip"
                        to={`/alerts?zone=${encodeURIComponent(z.zone_label)}`}
                      >
                        {z.name} — {z.active_alerts_count}
                      </Link>
                    ))}
                </div>
              )}
            </>
          )}
        </section>

        <div className="tmp-columns">
          <section className="mcv-section-card">
            <div className="mcv-section-header">
              <h2 className="section-title">
                <span className="mcv-section-icon" aria-hidden="true">&#128247;</span>
                Caméras du terminal
              </h2>
            </div>
            <ul className="tmp-camera-list">
              {cameras.map((c) => (
                <li key={c.id} className={`tmp-camera ${c.status !== 'active' ? 'tmp-camera--off' : ''}`}>
                  <span className={`tmp-camera-status ${c.status === 'active' ? 'is-on' : 'is-off'}`} />
                  <div className="tmp-camera-body">
                    <span className="tmp-camera-id">{c.id}</span>
                    <span className="tmp-camera-zone">{c.zone_label}</span>
                  </div>
                  <span className="tmp-camera-meta">
                    {c.last_container ? `Dernier : ${c.last_container}` : 'Aucun conteneur'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mcv-section-card">
            <div className="mcv-section-header">
              <h2 className="section-title">
                <span className="mcv-section-icon" aria-hidden="true">&#9888;</span>
                Conteneurs à vérifier
              </h2>
              <p className="section-description">Position ancienne — à confirmer sur le terrain.</p>
            </div>
            {toVerify.length === 0 ? (
              <p className="tmp-empty">Aucun conteneur à vérifier pour le moment.</p>
            ) : (
              <ul className="tmp-verify-list">
                {toVerify.map((c) => (
                  <li key={c.container_code} className="tmp-verify-item">
                    <span className="tmp-verify-code">{c.container_code}</span>
                    <span className="tmp-verify-zone">{c.zone_label || 'Zone inconnue'}</span>
                    <span className="tmp-verify-time">{c.elapsed_since_last_detection}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="mcv-section-card">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128230;</span>
              Derniers conteneurs détectés
            </h2>
          </div>
          {recent.length === 0 ? (
            <p className="tmp-empty">Aucune détection enregistrée pour le moment.</p>
          ) : (
            <div className="tmp-recent-grid">
              {recent.map((c) => (
                <button
                  type="button"
                  key={c.container_code}
                  className="tmp-recent-card"
                  onClick={() => setSelectedZone(c.zone_id || c.zone_label)}
                  title="Mettre en évidence sur la carte"
                >
                  {c.proof_image_url && (
                    <img
                      className="tmp-recent-thumb"
                      src={resolveAiAssetUrl(c.proof_image_url)}
                      alt={`Preuve ${c.container_code}`}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div className="tmp-recent-body">
                    <span className="tmp-recent-code">{c.container_code}</span>
                    <span className="tmp-recent-zone">{c.zone_label || 'Zone inconnue'}</span>
                    <span className="tmp-recent-meta">
                      {c.camera_name || '—'} • {formatDateTime(c.last_detected_at)}
                    </span>
                    <span className={`tmp-recent-badge ${c.needs_verification ? 'is-verify' : 'is-fresh'}`}>
                      {c.needs_verification ? 'À vérifier' : 'Récent'} — {c.elapsed_since_last_detection}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>Marsa Container Vision &mdash; Marsa Maroc &copy; 2026</p>
      </footer>
    </>
  );
}

export default TerminalMapPage;
