import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import OcrQualityPanel from './OcrQualityPanel';
import { uploadVisionImage, attachFrameToCamera } from '../services/api';
import './VisionUploadPage.css';

const CAMERA_OPTIONS = [
  { id: '', label: '— Choisir une caméra (optionnel) —' },
  { id: 'CAM_01', label: 'CAM_01 — Zone A - Quai Nord' },
  { id: 'CAM_02', label: 'CAM_02 — Zone B - Stockage' },
  { id: 'CAM_03', label: 'CAM_03 — Zone C - Entrée Port' },
  { id: 'CAM_04', label: 'CAM_04 — Zone D - Sortie Port' },
];

function VisionUploadPage() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [matchCode, setMatchCode] = useState('');
  const [location, setLocation] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [analysisMode, setAnalysisMode] = useState('ocr_only');
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const processFile = useCallback((f) => {
    setError(null);
    setResult(null);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!f.type.startsWith('image/')) {
      setError('Veuillez sélectionner un fichier image (PNG, JPEG, …).');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }, []);

  const onPick = (e) => {
    processFile(e.target.files?.[0]);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (loading) return;
    processFile(e.dataTransfer.files?.[0]);
  };

  const onAnalyze = async () => {
    if (!file) {
      setError('Sélectionnez une image.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (matchCode.trim()) fd.append('match_code', matchCode.trim());
      if (location.trim()) fd.append('location', location.trim());
      if (cameraId) fd.append('camera_id', cameraId);
      fd.append('mode', analysisMode);
      const res = await uploadVisionImage(fd);
      if (res.success) setResult(res.data);
      else setError(res.error || 'Analyse impossible');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const onAttachToCamera = async () => {
    const targetCam = cameraId || result?.storage?.camera_id;
    const evidence = result?.storage?.stored_image_url;
    const code = result?.storage?.primary_ocr_code || matchCode;
    if (!targetCam) {
      setError('Sélectionnez une caméra (CAM_01 à CAM_04) avant d\'associer l\'image.');
      return;
    }
    if (!evidence) {
      setError('Aucune image enregistrée à associer.');
      return;
    }
    setAttaching(true);
    setAttachMsg(null);
    setError(null);
    try {
      const res = await attachFrameToCamera(targetCam, evidence, code);
      if (res.success) {
        setAttachMsg(`Image ajoutée à ${targetCam} — visible dans Live Cameras (rotation des frames).`);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setAttaching(false);
    }
  };

  return (
    <>
      <Header />
      <main className="main-content vision-upload-page mcv-page">
        <Link to="/dashboard" className="mcv-btn mcv-btn--ghost vision-back-btn">
          &larr; Retour au tableau de bord
        </Link>

        <div className="vision-hero">
          <h2 className="section-title">
            <span className="mcv-section-icon" aria-hidden="true">&#128196;</span>
            Analyse d&apos;image (OCR / YOLO)
          </h2>
          <p className="section-description">
            Téléversez une photo de conteneur pour extraire les codes visibles.
            Mode OCR seul ou YOLO + OCR (modèle COCO générique — ne détecte pas spécifiquement les conteneurs).
          </p>
        </div>

        <p className="mcv-hint-box">
          L&apos;image analysée est <strong>enregistrée</strong> avec l&apos;emplacement, les codes OCR,
          les détections YOLO et le résultat complet (historique + base de données).
          Indiquez un emplacement pour faciliter la recherche ultérieure.
        </p>

        <div className="vision-card mcv-section-card">
          <div
            className={`vision-dropzone ${dragOver ? 'vision-dropzone--over' : ''} ${previewUrl ? 'vision-dropzone--has-image' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !loading && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Zone de dépôt d'image ou clic pour sélectionner"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onPick}
              disabled={loading}
              className="vision-file-input"
              aria-hidden="true"
            />

            {previewUrl ? (
              <div className="vision-preview">
                <img src={previewUrl} alt="Aperçu du conteneur sélectionné" />
                <p className="vision-preview-hint">Cliquez ou glissez une autre image pour remplacer</p>
              </div>
            ) : (
              <div className="vision-dropzone-empty">
                <span className="vision-dropzone-icon" aria-hidden="true">&#128247;</span>
                <strong>Glissez-déposez une image ici</strong>
                <p>ou cliquez pour sélectionner un fichier</p>
                <span className="vision-dropzone-formats">PNG, JPEG, WebP</span>
              </div>
            )}
          </div>

          <div className="vision-field">
            <label htmlFor="camera_id" className="mcv-label">Caméra simulée associée</label>
            <select
              id="camera_id"
              className="mcv-input vision-input"
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              disabled={loading}
            >
              {CAMERA_OPTIONS.map((o) => (
                <option key={o.id || 'none'} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="vision-field">
            <label htmlFor="location" className="mcv-label">Emplacement / zone (si pas de caméra)</label>
            <input
              id="location"
              className="mcv-input vision-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="ex. Quai Nord — parking camion, Zone B stockage"
              disabled={loading}
            />
          </div>

          <div className="vision-field">
            <label htmlFor="match_code" className="mcv-label">Code attendu (optionnel)</label>
            <input
              id="match_code"
              className="mcv-input vision-input"
              value={matchCode}
              onChange={(e) => setMatchCode(e.target.value)}
              placeholder="ex. 79943 ou MSCU7894563"
              disabled={loading}
            />
          </div>

          <fieldset className="vision-mode-field">
            <legend className="mcv-label">Mode d&apos;analyse</legend>
            <label className="vision-mode-option">
              <input
                type="radio"
                name="analysis_mode"
                value="ocr_only"
                checked={analysisMode === 'ocr_only'}
                onChange={() => setAnalysisMode('ocr_only')}
                disabled={loading}
              />
              OCR seul (rapide)
            </label>
            <label className="vision-mode-option">
              <input
                type="radio"
                name="analysis_mode"
                value="yolo_ocr"
                checked={analysisMode === 'yolo_ocr'}
                onChange={() => setAnalysisMode('yolo_ocr')}
                disabled={loading}
              />
              YOLO + OCR (expérimental)
            </label>
          </fieldset>

          <button
            type="button"
            className="mcv-btn mcv-btn--teal mcv-btn--full vision-analyze-btn"
            onClick={onAnalyze}
            disabled={loading || !file}
          >
            {loading ? (
              <>
                <span className="mcv-btn-spinner" aria-hidden="true" />
                {analysisMode === 'yolo_ocr'
                  ? 'Analyse YOLO + OCR en cours (30 s à 2 min)…'
                  : 'Analyse en cours…'}
              </>
            ) : (
              'Analyser'
            )}
          </button>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <span className="error-icon">&#9888;</span> {error}
          </div>
        )}

        {!result && !loading && !error && (
          <div className="mcv-empty vision-empty-state">
            <span className="mcv-empty-icon" aria-hidden="true">&#128300;</span>
            <strong>Aucune image analysée pour le moment</strong>
            <p>Choisissez une image de conteneur pour lancer l&apos;OCR.</p>
          </div>
        )}

        {result && (
          <div className="vision-result-card mcv-section-card">
            <h3 className="vision-result-title">Résultat de l&apos;analyse</h3>

            <OcrQualityPanel data={result} />

            {result.yolo_warning && (
              <p className="vision-yolo-warn" role="status">{result.yolo_warning}</p>
            )}
            {result.warnings?.length > 0 && (
              <ul className="vision-warnings">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <div className="vision-result-grid">
              <div className="vision-result-stat">
                <span className="vision-result-label">match_found</span>
                <span className="vision-result-value">
                  {result.match_requested || matchCode ? (
                    <span className={`mcv-badge ${result.match_found ? 'mcv-badge--success' : 'mcv-badge--warning'}`}>
                      {result.match_found ? 'true' : 'false'}
                    </span>
                  ) : (
                    'non testé'
                  )}
                </span>
              </div>
              {result.matched_text && (
                <div className="vision-result-stat">
                  <span className="vision-result-label">matched_text</span>
                  <span className="vision-result-value vision-code-cell">{result.matched_text}</span>
                </div>
              )}
              <div className="vision-result-stat">
                <span className="vision-result-label">pipeline_mode</span>
                <span className="vision-result-value">{result.pipeline_mode || 'ocr_only'}</span>
              </div>
              {result.yolo_detection_count != null && (
                <div className="vision-result-stat">
                  <span className="vision-result-label">yolo_detection_count</span>
                  <span className="vision-result-value">{result.yolo_detection_count}</span>
                </div>
              )}
              <div className="vision-result-stat">
                <span className="vision-result-label">Confiance OCR moyenne</span>
                <span className="vision-result-value vision-result-confidence">
                  {result.ocr_avg_confidence != null
                    ? `${(Number(result.ocr_avg_confidence) * 100).toFixed(1)}%`
                    : 'non calculée'}
                </span>
              </div>
            </div>

            <p className="vision-result-note">
              {result.storage?.stored ? (
                <>
                  <span className="mcv-badge mcv-badge--success">Image enregistrée</span>
                  {' '}
                  Emplacement : <strong>{result.storage.zone}</strong>
                  {result.storage.primary_ocr_code && (
                    <> — Code OCR principal : <strong>{result.storage.primary_ocr_code}</strong></>
                  )}
                </>
              ) : (
                'Caméra simulée non utilisée — upload manuel.'
              )}
            </p>

            {result.storage?.stored_image_url && (
              <div className="vision-stored-preview mcv-img-zoom">
                <h4>Image enregistrée (preuve)</h4>
                <img
                  src={result.storage.stored_image_url}
                  alt="Preuve upload enregistrée"
                  className="vision-stored-img"
                />
                <p className="vision-stored-meta">
                  Fichier : {result.storage.stored_filename}
                  {result.storage.history_id != null && (
                    <> — Historique #{result.storage.history_id}</>
                  )}
                </p>
              </div>
            )}

            {result.extracted_codes?.length > 0 ? (
              <div className="vision-codes">
                <h4>Codes extraits</h4>
                <div className="mcv-table-wrap">
                  <table className="mcv-table vision-codes-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.extracted_codes.map((c, i) => (
                        <tr key={`${c.normalized_code}-${i}`}>
                          <td className="vision-code-cell">{c.normalized_code}</td>
                          <td>{c.pattern_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="vision-no-codes">Aucun code conteneur détecté sur cette image.</p>
            )}

            {result.preprocessing_stages?.length > 0 && (
              <p className="vision-pipeline">
                <strong>Étapes prétraitement :</strong>{' '}
                {result.preprocessing_stages.join(' → ')}
              </p>
            )}

            {result.yolo_detections?.length > 0 && (
              <details className="vision-ocr-details">
                <summary>Détections YOLO ({result.yolo_detections.length})</summary>
                <ul>
                  {result.yolo_detections.map((d, i) => (
                    <li key={i}>
                      {d.class_name} — conf. {(Number(d.confidence) * 100).toFixed(0)}%
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {result.sample_ocr_lines?.length > 0 && (
              <details className="vision-ocr-details">
                <summary>Lignes OCR (extrait)</summary>
                <ul>
                  {result.sample_ocr_lines.map((l, i) => (
                    <li key={i}>
                      {l.text} <em>({(l.confidence * 100).toFixed(0)}%)</em>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {result.storage?.stored && (
              <div className="vision-attach-row">
                <button
                  type="button"
                  className="mcv-btn mcv-btn--primary"
                  onClick={onAttachToCamera}
                  disabled={attaching || !cameraId}
                >
                  {attaching ? 'Ajout en cours…' : 'Ajouter cette image à la caméra'}
                </button>
                {!cameraId && (
                  <p className="vision-attach-hint">Sélectionnez une caméra ci-dessus pour activer ce bouton.</p>
                )}
                {attachMsg && <p className="mcv-success-inline" role="status">{attachMsg}</p>}
              </div>
            )}
          </div>
        )}

        <section className="vision-video-help mcv-section-card">
          <h3 className="vision-result-title">Importer une vidéo de test</h3>
          <p>
            Placez votre fichier dans <code>ai-service/demo_videos/</code>, puis extrayez des frames :
          </p>
          <pre className="vision-code-block">{`cd ai-service/demo_videos
ffmpeg -i conteneur_test.mp4 -vf fps=1 ../demo_images/cam03_frame_%04d.jpg`}</pre>
          <p>
            Ajoutez les fichiers dans <code>demo_cameras.json</code> (section <code>images</code>)
            ou utilisez « Ajouter cette image à la caméra » après un upload.
          </p>
        </section>
      </main>
    </>
  );
}

export default VisionUploadPage;
