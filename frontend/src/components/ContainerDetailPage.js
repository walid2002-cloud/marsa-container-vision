import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Header from './Header';
import TerminalMap, { resolveZoneIdFromZones } from './TerminalMap';
import { getContainerReport, getTerminalMap } from '../services/api';
import { resolveAiAssetUrl } from '../utils/detectionDisplay';
import './ContainerDetailPage.css';

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR');
}

function OcrBadge({ quality }) {
  if (!quality) return <span className="cd-badge cd-badge--muted">OCR n/a</span>;
  const cls = quality === 'bon' ? 'cd-badge--success'
    : quality === 'moyen' ? 'cd-badge--info'
      : 'cd-badge--warning';
  return <span className={`cd-badge ${cls}`}>OCR : {quality}</span>;
}

function SeverityBadge({ severity }) {
  const cls = severity === 'critical' ? 'cd-badge--danger'
    : severity === 'warning' ? 'cd-badge--warning' : 'cd-badge--info';
  return <span className={`cd-badge ${cls}`}>{severity}</span>;
}

function ContainerDetailPage() {
  const { code } = useParams();
  const [report, setReport] = useState(null);
  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReport, setShowReport] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [r, m] = await Promise.all([
        getContainerReport(code),
        getTerminalMap(12).catch(() => null),
      ]);
      if (r.success) setReport(r.data);
      else setError('Impossible de charger le rapport du conteneur.');
      if (m && m.success) setMap(m.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Impossible de charger le conteneur.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  const pos = report?.last_position || null;
  const zones = map?.zones || [];
  const cameras = map?.cameras || [];

  const activeZoneId = useMemo(() => {
    if (!pos?.last_zone && !pos?.last_camera_name) return null;
    return resolveZoneIdFromZones(zones, pos.last_zone || pos.last_camera_name || pos.last_camera_id);
  }, [pos, zones]);

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_${report.container_code}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Header />
      <main className="main-content mcv-page cd-page">
        <div className="cd-toolbar">
          <Link to="/dashboard" className="cd-btn cd-btn--ghost">&larr; Retour</Link>
          <div className="cd-toolbar-actions">
            <button type="button" className="cd-btn cd-btn--secondary" onClick={() => setShowReport(true)} disabled={!report}>
              Rapport conteneur
            </button>
            {report?.links?.map_url && (
              <a className="cd-btn cd-btn--primary" href={report.links.map_url}>Voir sur la carte</a>
            )}
          </div>
        </div>

        <section className="mcv-section-card cd-header-card">
          <div className="cd-header-main">
            <span className="cd-header-icon" aria-hidden="true">&#128230;</span>
            <div>
              <h2 className="section-title cd-code">{code}</h2>
              <p className="section-description">
                {report?.has_known_position
                  ? 'Dernière position connue disponible.'
                  : 'Aucune position connue pour ce conteneur.'}
              </p>
            </div>
          </div>
          <div className="cd-header-badges">
            {pos && (
              <span className={`cd-badge ${pos.needs_verification ? 'cd-badge--warning' : 'cd-badge--success'}`}>
                {pos.needs_verification ? 'Position à vérifier' : 'Position récente'}
              </span>
            )}
            <OcrBadge quality={report?.ocr?.quality} />
            {report?.yolo?.orientation && report.yolo.orientation !== 'unknown' && (
              <span className="cd-badge cd-badge--info">Orientation : {report.yolo.orientation}</span>
            )}
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span className="error-icon">&#9888;</span> {error}
          </div>
        )}

        {loading && (
          <div className="app-loading app-loading--inline">
            <span className="spinner" aria-hidden="true" /> Chargement du conteneur…
          </div>
        )}

        {!loading && report && (
          <div className="cd-grid">
            <section className="mcv-section-card">
              <h3 className="an-section-title">Dernière position connue</h3>
              {pos ? (
                <ul className="cd-facts">
                  <li><span>Zone</span><strong>{pos.last_zone || '—'}</strong></li>
                  <li><span>Caméra</span><strong>{pos.last_camera_name || pos.last_camera_id || '—'}</strong></li>
                  <li><span>Détecté</span><strong>{formatDateTime(pos.last_detected_at)}</strong></li>
                  <li><span>Temps écoulé</span><strong>{pos.elapsed_since_last_detection || '—'}</strong></li>
                  <li><span>Confiance</span><strong>{pos.last_confidence != null ? `${Math.round(pos.last_confidence * 100)}%` : '—'}</strong></li>
                  <li><span>Mouvements</span><strong>{pos.movements_count ?? report.tracking?.movements_count ?? 0}</strong></li>
                </ul>
              ) : (
                <div className="mcv-empty an-empty-inline">
                  <strong>Aucune position enregistrée</strong>
                  <p>Ce conteneur n&apos;a pas encore été détecté par le système.</p>
                </div>
              )}
            </section>

            <section className="mcv-section-card">
              <h3 className="an-section-title">Carte du terminal</h3>
              {zones.length > 0 ? (
                <TerminalMap
                  zones={zones}
                  cameras={cameras}
                  activeZoneId={activeZoneId}
                  activeCameraId={pos?.last_camera_id || null}
                />
              ) : (
                <p className="cd-muted">Carte indisponible.</p>
              )}
            </section>

            <section className="mcv-section-card">
              <h3 className="an-section-title">Preuves visuelles ({report.proofs?.length || 0})</h3>
              {report.proofs?.length > 0 ? (
                <div className="cd-proofs">
                  {report.proofs.map((p) => (
                    <figure key={p.proof_id} className="cd-proof">
                      <a href={p.image_url} target="_blank" rel="noreferrer" className="cd-proof-img">
                        <img
                          src={resolveAiAssetUrl(p.image_url)}
                          alt={`Preuve ${report.container_code}`}
                          loading="lazy"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                        <span className="cd-proof-ph" style={{ display: 'none' }}>Image indisponible</span>
                      </a>
                      <figcaption>
                        {p.source || 'source'} · {formatDateTime(p.captured_at)}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="cd-muted">Aucune preuve visuelle disponible pour ce conteneur.</p>
              )}
            </section>

            <section className="mcv-section-card">
              <h3 className="an-section-title">Alertes liées ({report.alerts?.length || 0})</h3>
              {report.alerts?.length > 0 ? (
                <ul className="cd-alerts">
                  {report.alerts.map((a) => (
                    <li key={a.id || `${a.type}-${a.created_at}`} className="cd-alert">
                      <div className="cd-alert-head">
                        <strong>{a.type}</strong>
                        <SeverityBadge severity={a.severity} />
                      </div>
                      <p>{a.message}</p>
                      <span className="cd-alert-meta">{formatDateTime(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cd-muted">Aucune alerte active pour ce conteneur.</p>
              )}
            </section>

            <section className="mcv-section-card cd-span-2">
              <h3 className="an-section-title">Historique des déplacements ({report.tracking?.movements_count || 0})</h3>
              {report.tracking?.movements?.length > 0 ? (
                <ol className="cd-timeline">
                  {report.tracking.movements.map((m) => (
                    <li key={m.id} className="cd-timeline-item">
                      <span className="cd-timeline-dot" aria-hidden="true" />
                      <div className="cd-timeline-body">
                        <strong>{formatDateTime(m.detected_at)} — {m.camera_name || m.camera_id || '—'}</strong>
                        <span>{m.zone || 'Zone inconnue'}</span>
                        <span className="cd-timeline-meta">
                          {m.elapsed_since_detection}
                          {m.proof_url && (
                            <> · <a href={resolveAiAssetUrl(m.proof_url)} target="_blank" rel="noreferrer">Voir preuve</a></>
                          )}
                        </span>
                      </div>
                      {m.confidence != null && (
                        <span className="cd-badge cd-badge--info">{Math.round(m.confidence * 100)}%</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="cd-muted">Aucun déplacement enregistré.</p>
              )}
            </section>
          </div>
        )}
      </main>

      {showReport && report && (
        <div className="cd-modal-overlay" onClick={() => setShowReport(false)}>
          <div className="cd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cd-modal-head">
              <h3>Rapport conteneur — {report.container_code}</h3>
              <button type="button" className="cd-modal-close" onClick={() => setShowReport(false)} aria-label="Fermer">&times;</button>
            </div>
            <pre className="cd-modal-json">{JSON.stringify(report, null, 2)}</pre>
            <div className="cd-modal-actions">
              <button type="button" className="cd-btn cd-btn--primary" onClick={downloadReport}>Télécharger JSON</button>
              <button type="button" className="cd-btn cd-btn--ghost" onClick={() => setShowReport(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ContainerDetailPage;
