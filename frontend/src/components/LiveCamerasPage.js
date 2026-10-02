import React, { useEffect, useState, useCallback } from 'react';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import CameraAdminPanel from './CameraAdminPanel';
import { useAuth } from '../contexts/AuthContext';
import {
  listCameras,
  getCamerasLiveBoard,
  analyzeCamera,
  scanAllCameras,
  advanceCameraFrame,
  getSettings,
} from '../services/api';
import { resolveAiAssetUrl } from '../utils/detectionDisplay';
import './LiveCamerasPage.css';

const CAM_ORDER = ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04'];
const LIVE_REFRESH_MS = 3500;

function formatClock(d = new Date()) {
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LiveCamerasPage() {
  const { hasPermission } = useAuth();
  const [adminCameras, setAdminCameras] = useState([]);
  const [rows, setRows] = useState([]);
  const [appMode, setAppMode] = useState('DEMO');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [scanningId, setScanningId] = useState(null);
  const [scanningAll, setScanningAll] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const [frameTick, setFrameTick] = useState(0);
  const [clock, setClock] = useState(formatClock());
  const [advancingId, setAdvancingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [boardRes, listRes, settingsRes] = await Promise.all([
        getCamerasLiveBoard().catch(() => null),
        listCameras().catch(() => null),
        getSettings().catch(() => null),
      ]);
      if (settingsRes?.success) setAppMode(settingsRes.data?.app_mode || 'DEMO');
      if (listRes?.success) setAdminCameras(listRes.data?.cameras || []);
      if (boardRes?.success) {
        const data = boardRes.data || [];
        const sorted = [...data].sort(
          (a, b) => CAM_ORDER.indexOf(a.id) - CAM_ORDER.indexOf(b.id)
        );
        setRows(sorted.length ? sorted.filter((c) => CAM_ORDER.includes(c.id) || c.rtsp_configured) : data);
      } else if (listRes?.success) {
        setRows(listRes.data?.cameras || []);
      }
      setErr(null);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      setFrameTick((n) => n + 1);
      setClock(formatClock());
    }, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const handleAnalyze = async (camId) => {
    setScanningId(camId);
    setScanMsg(null);
    setErr(null);
    try {
      const res = await analyzeCamera(camId);
      if (res.success) {
        const codes = (res.data?.extracted_codes || []).map((c) => c.normalized_code).filter(Boolean);
        const q = res.data?.ocr_quality ? ` — qualité OCR : ${res.data.ocr_quality}` : '';
        const partial = res.data?.partial_code_detected ? ' — code partiel' : '';
        setScanMsg(
          `Analyse ${camId} — frame ${(res.data?.frame_index ?? 0) + 1}/${res.data?.frame_count ?? 1} — ` +
          `${res.data?.last_container || codes[0] || 'aucun code lisible'}${q}${partial}`
        );
        await load();
        setFrameTick((n) => n + 1);
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setScanningId(null);
    }
  };

  const handleNextFrame = async (camId) => {
    setAdvancingId(camId);
    try {
      await advanceCameraFrame(camId);
      setFrameTick((n) => n + 1);
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setAdvancingId(null);
    }
  };

  const handleScanAll = async () => {
    setScanningAll(true);
    setScanMsg(null);
    setErr(null);
    try {
      const res = await scanAllCameras();
      if (res.success) {
        setScanMsg(`${res.data?.cameras_scanned || 0} caméra(s) analysée(s) sur la frame courante de chacune.`);
        await load();
        setFrameTick((n) => n + 1);
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setScanningAll(false);
    }
  };

  return (
    <>
      <Header />
      <main className="main-content main-content--wide lc-page mcv-page">
        <PrototypeBanner />
        {hasPermission('cameras.manage') && (
          <CameraAdminPanel cameras={adminCameras} onRefresh={load} />
        )}
        <div className="lc-hero">
          <div>
            <h2 className="section-title">Live Cameras</h2>
            <p className="section-description">
              {appMode === 'PRODUCTION'
                ? 'Mode production — aperçu via snapshots backend (RTSP → FFmpeg/OpenCV). Le navigateur n\'ouvre jamais rtsp:// directement.'
                : 'Mode simulation — images locales. Les flux RTSP réels ne sont pas connectés au port.'}
            </p>
          </div>
          <div className="lc-hero-actions">
            <span className={`mcv-live-pill lc-refresh-pill ${appMode === 'PRODUCTION' ? 'lc-pill--prod' : ''}`}>
              <span className="mcv-live-dot" aria-hidden="true" />
              {appMode === 'PRODUCTION' ? 'PRODUCTION' : 'SIMULATION LIVE'}
            </span>
            <button
              type="button"
              className="mcv-btn mcv-btn--primary lc-scan-all-btn"
              onClick={handleScanAll}
              disabled={scanningAll || loading}
            >
              {scanningAll ? 'Scan en cours…' : 'Scanner toutes les caméras'}
            </button>
          </div>
        </div>

        <p className="mcv-hint-box">
          Une caméra peut afficher <strong>plusieurs conteneurs</strong> au fil des frames.
          Le flux se rafraîchit automatiquement toutes les {LIVE_REFRESH_MS / 1000}s.
          Utilisez « Frame suivante » pour avancer manuellement, puis « Analyser maintenant » pour OCR (+ YOLO si activé).
        </p>

        {scanMsg && (
          <div className="mcv-success-banner" role="status">{scanMsg}</div>
        )}

        {err && (
          <div className="error-banner" role="alert">
            <span className="error-icon">&#9888;</span> {err}
          </div>
        )}

        {loading && (
          <div className="app-loading app-loading--inline">
            <span className="spinner" aria-hidden="true" />
            Chargement des caméras…
          </div>
        )}

        <div className="lc-grid mcv-stagger">
          {rows.map((cam) => {
            const demo = cam.demo_image ? `/ai/demo_images/${cam.demo_image}` : null;
            const live = `/ai/cameras/${encodeURIComponent(cam.id)}/live-preview?t=${frameTick}`;
            const ld = cam.last_detection || {};
            const isActive = (cam.status || 'active') === 'active';
            const noDetection = !ld.container_code;
            const lastUpdate = ld.detected_at || cam.last_analysis_time;
            const frameCount = cam.frame_count || 1;
            const knownCodes = cam.known_container_codes || [];
            const currentFrame = cam.current_frame || {};
            const frameLabel = currentFrame.filename
              ? `${(currentFrame.index ?? 0) + 1}/${frameCount}`
              : `1/${frameCount}`;

            return (
              <article
                key={cam.id}
                className={`lc-card lc-card--monitor ${isActive ? 'lc-card--live' : 'lc-card--inactive'}`}
              >
                <div className="lc-card-head">
                  <h3>{cam.name || cam.id}</h3>
                  <span className={`lc-status ${isActive ? 'lc-active' : 'lc-inactive'}`}>
                    {isActive && <span className="lc-status-dot" aria-hidden="true" />}
                    {isActive ? 'active' : cam.status}
                  </span>
                </div>
                <div className="lc-badges">
                  <span className="mcv-tag mcv-tag--live">LIVE</span>
                  {appMode !== 'PRODUCTION' && <span className="mcv-tag mcv-tag--demo">SIMULATION</span>}
                  {cam.rtsp_configured
                    ? <span className="mcv-tag mcv-tag--rtsp-on">RTSP ON</span>
                    : <span className="mcv-tag mcv-tag--rtsp-off">RTSP OFF</span>}
                </div>
                <div className="lc-img-wrap mcv-img-zoom lc-monitor-wrap">
                  {isActive && <span className="lc-live-badge" aria-hidden="true">REC</span>}
                  <div className="lc-monitor-overlay">
                    <span>{cam.id}</span>
                    <span>{cam.zone}</span>
                    <span>{clock}</span>
                  </div>
                  <img
                    key={`${cam.id}-${frameTick}`}
                    src={live}
                    alt={`Flux simulé ${cam.id}`}
                    className="lc-img lc-img--live"
                    onError={(e) => {
                      const el = e.currentTarget;
                      const fallback = resolveAiAssetUrl(cam.current_frame_url) || demo;
                      if (fallback && el.src !== fallback) el.src = fallback;
                    }}
                  />
                  <div className="lc-frame-bar">
                    <span>Frame {frameLabel}</span>
                    <span>{knownCodes.length} code(s) connu(s)</span>
                  </div>
                </div>
                <dl className="lc-dl">
                  <div className="lc-dl-row">
                    <dt>Zone</dt>
                    <dd>{cam.zone || 'Non définie'}</dd>
                  </div>
                  <div className="lc-dl-row">
                    <dt>Frames</dt>
                    <dd>{frameCount} image(s) — rotation auto + manuelle</dd>
                  </div>
                  {knownCodes.length > 0 && (
                    <div className="lc-dl-row lc-dl-row--full">
                      <dt>Conteneurs visibles</dt>
                      <dd className="lc-codes-list">{knownCodes.join(', ')}</dd>
                    </div>
                  )}
                  <div className="lc-dl-row">
                    <dt>Dernier conteneur</dt>
                    <dd className={noDetection ? 'lc-dl-empty' : 'lc-dl-code'}>
                      {ld.container_code || 'Aucune détection enregistrée'}
                    </dd>
                  </div>
                  <div className="lc-dl-row">
                    <dt>Confiance</dt>
                    <dd>
                      {ld.confidence != null
                        ? `${(Number(ld.confidence) * 100).toFixed(0)}%`
                        : 'Non mesurée'}
                    </dd>
                  </div>
                  <div className="lc-dl-row">
                    <dt>YOLO</dt>
                    <dd>{ld.yolo_detected ? 'oui' : 'non'}</dd>
                  </div>
                  <div className="lc-dl-row">
                    <dt>OCR</dt>
                    <dd>oui</dd>
                  </div>
                  <div className="lc-dl-row lc-dl-row--full">
                    <dt>Dernière analyse</dt>
                    <dd>
                      {lastUpdate
                        ? new Date(lastUpdate).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Jamais analysée'}
                    </dd>
                  </div>
                </dl>
                <div className="lc-card-actions">
                  <button
                    type="button"
                    className="mcv-btn mcv-btn--ghost lc-frame-btn"
                    onClick={() => handleNextFrame(cam.id)}
                    disabled={advancingId === cam.id || scanningAll}
                  >
                    {advancingId === cam.id ? '…' : 'Frame suivante'}
                  </button>
                  <button
                    type="button"
                    className="mcv-btn mcv-btn--secondary lc-analyze-btn"
                    onClick={() => handleAnalyze(cam.id)}
                    disabled={scanningId === cam.id || scanningAll}
                  >
                    {scanningId === cam.id ? 'Analyse…' : 'Analyser maintenant'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}

export default LiveCamerasPage;
