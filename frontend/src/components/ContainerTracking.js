import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './ContainerTracking.css';
import { resolveAiAssetUrl } from '../utils/detectionDisplay';
import { alertTypeLabel, severityLabel } from '../utils/alertDisplay';
import TerminalMap, { resolveZoneIdFromZones } from './TerminalMap';
import { getTerminalMap } from '../services/api';

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR');
}

function sourceLabel(source) {
  switch (source) {
    case 'manual':
      return 'Recherche manuelle';
    case 'upload':
      return 'Analyse image';
    case 'camera_scan':
      return 'Scan caméra';
    case 'whatsapp-bot':
    case 'whatsapp':
      return 'Bot WhatsApp';
    default:
      return source || 'Système';
  }
}

/**
 * Fiche « dernière position connue » + timeline des déplacements (Phase 1).
 */
function ContainerTracking({ lastPosition, movements, alerts, liveDetected }) {
  const [mapData, setMapData] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const mapRef = useRef(null);

  const zoneRef = lastPosition?.last_zone || lastPosition?.last_camera_name || lastPosition?.last_camera_id;
  const cameraRef = lastPosition?.last_camera_name || lastPosition?.last_camera_id;

  const handleShowOnMap = useCallback(async () => {
    setMapOpen(true);
    if (!mapData) {
      try {
        setMapLoading(true);
        const res = await getTerminalMap(12);
        if (res.success) setMapData(res.data);
      } catch {
        /* non-bloquant */
      } finally {
        setMapLoading(false);
      }
    }
    setTimeout(() => {
      mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }, [mapData]);

  const activeAlerts = Array.isArray(alerts) ? alerts : [];

  if (!lastPosition && (!movements || movements.length === 0) && activeAlerts.length === 0) {
    return null;
  }

  const needsVerification = lastPosition?.needs_verification;
  const proofUrl = lastPosition?.last_proof_image_url
    ? resolveAiAssetUrl(lastPosition.last_proof_image_url)
    : null;

  const zones = mapData?.zones || [];
  const activeZoneId = zones.length ? resolveZoneIdFromZones(zones, zoneRef) : null;

  return (
    <div className="ct-wrap">
      {activeAlerts.length > 0 && (
        <section className="ct-card ct-alerts">
          <div className="ct-card-header">
            <h4 className="ct-card-title">
              <span className="ct-icon" aria-hidden="true">&#128680;</span>
              Alertes actives ({activeAlerts.length})
            </h4>
            <Link className="ct-map-link" to="/alerts">Voir toutes les alertes &rarr;</Link>
          </div>
          <ul className="ct-alert-list">
            {activeAlerts.map((a) => (
              <li key={a.id || a.alert_uuid} className={`ct-alert ct-alert--${a.severity}`}>
                <span className={`ct-alert-badge ct-alert-badge--${a.severity}`}>{severityLabel(a.severity)}</span>
                <span className="ct-alert-type">{alertTypeLabel(a.type)}</span>
                <span className="ct-alert-msg">{a.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lastPosition && (
        <section className="ct-card">
          <div className="ct-card-header">
            <h4 className="ct-card-title">
              <span className="ct-icon" aria-hidden="true">&#128205;</span>
              Dernière position connue
            </h4>
            <div className="ct-badges">
              {!liveDetected && (
                <span className="ct-badge ct-badge--history">Position historique</span>
              )}
              {needsVerification ? (
                <span className="ct-badge ct-badge--verify">&#9888; Position à vérifier</span>
              ) : (
                <span className="ct-badge ct-badge--fresh">Position récente</span>
              )}
            </div>
          </div>

          <div className="ct-elapsed">
            <span className="ct-elapsed-icon" aria-hidden="true">&#128337;</span>
            <span className="ct-elapsed-text">
              {lastPosition.elapsed_since_last_detection || '—'}
            </span>
          </div>

          <div className="ct-grid">
            <div className="ct-field">
              <span className="ct-field-label">Zone</span>
              <span className="ct-field-value">{lastPosition.last_zone || 'Zone inconnue'}</span>
            </div>
            <div className="ct-field">
              <span className="ct-field-label">Caméra</span>
              <span className="ct-field-value">{lastPosition.last_camera_name || '—'}</span>
            </div>
            <div className="ct-field">
              <span className="ct-field-label">Vue le</span>
              <span className="ct-field-value">{formatDateTime(lastPosition.last_detected_at)}</span>
            </div>
            <div className="ct-field">
              <span className="ct-field-label">Confiance</span>
              <span className="ct-field-value">
                {lastPosition.last_confidence != null
                  ? `${(Number(lastPosition.last_confidence) * 100).toFixed(1)}%`
                  : '—'}
              </span>
            </div>
            <div className="ct-field">
              <span className="ct-field-label">Détections totales</span>
              <span className="ct-field-value">{lastPosition.movements_count ?? '—'}</span>
            </div>
            {lastPosition.orientation && (
              <div className="ct-field">
                <span className="ct-field-label">Orientation</span>
                <span className="ct-field-value">{lastPosition.orientation}</span>
              </div>
            )}
          </div>

          {proofUrl && (
            <div className="ct-proof mcv-img-zoom">
              <img src={proofUrl} alt="Preuve dernière position" className="ct-proof-thumb" />
            </div>
          )}

          <div className="ct-actions">
            <button type="button" className="ct-map-btn" onClick={handleShowOnMap}>
              <span aria-hidden="true">&#128506;</span> Voir sur la carte
            </button>
            <Link
              className="ct-map-link"
              to={`/terminal-map?zone=${encodeURIComponent(zoneRef || '')}&camera=${encodeURIComponent(cameraRef || '')}&code=${encodeURIComponent(lastPosition.container_code || '')}`}
            >
              Ouvrir la carte complète &rarr;
            </Link>
            {lastPosition.container_code && (
              <Link
                className="ct-map-link"
                to={`/containers/${encodeURIComponent(lastPosition.container_code)}`}
              >
                Fiche conteneur &rarr;
              </Link>
            )}
          </div>
        </section>
      )}

      {mapOpen && (
        <section className="ct-card ct-map-inline" ref={mapRef}>
          <div className="ct-card-header">
            <h4 className="ct-card-title">
              <span className="ct-icon" aria-hidden="true">&#128205;</span>
              Position sur la carte du terminal
            </h4>
            <button type="button" className="ct-map-close" onClick={() => setMapOpen(false)}>
              Masquer
            </button>
          </div>
          {mapLoading ? (
            <div className="mcv-progress-banner" role="status">
              <span className="spinner" aria-hidden="true" /> Chargement de la carte…
            </div>
          ) : (
            <TerminalMap
              zones={zones}
              cameras={mapData?.cameras || []}
              activeZoneId={activeZoneId}
              activeCameraId={cameraRef}
            />
          )}
        </section>
      )}

      {movements && movements.length > 0 && (
        <section className="ct-card">
          <h4 className="ct-card-title">
            <span className="ct-icon" aria-hidden="true">&#128506;</span>
            Historique des déplacements
            <span className="ct-count">{movements.length}</span>
          </h4>
          <ol className="ct-timeline">
            {movements.map((m, idx) => (
              <li key={m.id || idx} className={`ct-timeline-item ${idx === 0 ? 'ct-timeline-item--latest' : ''}`}>
                <span className="ct-timeline-dot" aria-hidden="true" />
                <div className="ct-timeline-body">
                  <div className="ct-timeline-top">
                    <span className="ct-timeline-zone">{m.zone || 'Zone inconnue'}</span>
                    <span className="ct-timeline-time">{m.elapsed_since_detection}</span>
                  </div>
                  <div className="ct-timeline-meta">
                    <span>{m.camera_name || '—'}</span>
                    <span className="ct-timeline-sep">•</span>
                    <span>{formatDateTime(m.detected_at)}</span>
                    <span className="ct-timeline-sep">•</span>
                    <span className="ct-timeline-source">{sourceLabel(m.source)}</span>
                    {m.confidence != null && (
                      <>
                        <span className="ct-timeline-sep">•</span>
                        <span>{(Number(m.confidence) * 100).toFixed(0)}%</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export default ContainerTracking;
