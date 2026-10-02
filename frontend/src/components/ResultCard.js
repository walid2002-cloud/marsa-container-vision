import React, { useState } from 'react';
import './ResultCard.css';
import ContainerTracking from './ContainerTracking';
import OcrQualityPanel from './OcrQualityPanel';
import {
  resolveAiAssetUrl,
  sourceMatchLabel,
  detectionModeLabel,
  yoloStatusText,
} from '../utils/detectionDisplay';

function EvidenceModal({ imagePath, annotatedPath, onClose }) {
  const paths = [];
  if (annotatedPath) paths.push({ label: 'Image annotée (preuve)', p: annotatedPath });
  if (imagePath) paths.push({ label: 'Image source', p: imagePath });

  return (
    <div className="evidence-overlay" onClick={onClose}>
      <div className="evidence-modal" onClick={(e) => e.stopPropagation()}>
        <div className="evidence-modal-header">
          <h4>Images de preuve</h4>
          <button type="button" className="evidence-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="evidence-modal-body">
          {paths.length === 0 ? (
            <div className="evidence-placeholder">
              <span className="evidence-placeholder-icon">&#128247;</span>
              <p><strong>Aucune image preuve disponible</strong></p>
            </div>
          ) : (
            paths.map(({ label, p }) => {
              const imageUrl = resolveAiAssetUrl(p);
              return (
                <div key={p} className="evidence-block">
                  <p className="evidence-block-title">{label}</p>
                  <div className="evidence-image-container">
                    <img
                      src={imageUrl}
                      alt={label}
                      className="evidence-image"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        const fb = e.target.nextSibling;
                        if (fb) fb.style.display = 'block';
                      }}
                    />
                    <div className="evidence-fallback" style={{ display: 'none' }}>
                      <span className="evidence-placeholder-icon">&#128247;</span>
                      <p><strong>Impossible de charger l&apos;image</strong></p>
                      <code className="evidence-path">{p}</code>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, adminName, onReanalyze, loading }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const isDetected = result.detected;
  const hasKnownPosition = Boolean(result.has_known_position && result.last_position);
  const foundEffective = isDetected || hasKnownPosition;
  const sourceLabel = sourceMatchLabel(result.source_match);
  const modeLabel = detectionModeLabel(result.detection_mode, result.source_match);
  const evidenceUrl = result.annotated_image_url || result.evidence_image_url || result.image_path;

  return (
    <div className={`result-card ${isDetected ? 'result-detected' : 'result-not-detected'}`}>
      <div className="result-header">
        <span className="result-header-icon">{isDetected ? '\u2705' : '\u274C'}</span>
        <div className="result-header-text">
          <h3 className="result-header-title">
            {isDetected ? 'Conteneur détecté' : 'Conteneur non détecté'}
          </h3>
          <p className="result-header-message">{result.message}</p>
          {!isDetected && hasKnownPosition && (
            <p className="result-status-hint">
              Non vu en direct, mais une dernière position connue est disponible (voir ci-dessous).
            </p>
          )}
          {result.detection_status && result.detection_status !== 'ok' && (
            <p className="result-status-hint">Statut : {result.detection_status}</p>
          )}
        </div>
        <span className={`result-status-badge ${isDetected ? 'rsb-detected' : (hasKnownPosition ? 'rsb-history' : 'rsb-not-detected')}`}>
          {isDetected ? 'Détecté' : (hasKnownPosition ? 'Position connue' : 'Absent')}
        </span>
      </div>

      <div className="result-badges">
        <span className="mcv-tag mcv-tag--ocr">OCR</span>
        {result.yolo_detected && <span className="mcv-tag mcv-tag--yolo">YOLO</span>}
        <span className="mcv-tag mcv-tag--rtsp-off">RTSP OFF</span>
      </div>

      <div className="result-grid">
        <div className="result-field">
          <span className="result-field-label">Code recherché</span>
          <span className="result-field-value result-field-code">{result.searched_code}</span>
        </div>

        {isDetected && result.detected_code && (
          <div className="result-field">
            <span className="result-field-label">Code détecté</span>
            <span className="result-field-value result-field-code">{result.detected_code}</span>
          </div>
        )}

        <div className="result-field">
          <span className="result-field-label">Dernière détection</span>
          <span className="result-field-value">
            {result.detected_at
              ? new Date(result.detected_at).toLocaleString('fr-FR')
              : new Date().toLocaleString('fr-FR')}
          </span>
        </div>

        {isDetected ? (
          <>
            <div className="result-field">
              <span className="result-field-label">Caméra</span>
              <span className="result-field-value">{result.camera_name || 'Non identifiée'}</span>
            </div>
            <div className="result-field">
              <span className="result-field-label">Zone</span>
              <span className="result-field-value">{result.zone || 'Zone inconnue'}</span>
            </div>
            <div className="result-field">
              <span className="result-field-label">Confiance OCR</span>
              <span className="result-field-value result-field-confidence">
                {(Number(result.confidence) * 100).toFixed(1)}%
              </span>
            </div>
            {result.global_confidence != null && (
              <div className="result-field">
                <span className="result-field-label">Confiance globale</span>
                <span className="result-field-value result-field-confidence">
                  {(Number(result.global_confidence) * 100).toFixed(1)}%
                </span>
              </div>
            )}
            <div className="result-field">
              <span className="result-field-label">YOLO utilisé</span>
              <span className="result-field-value">{yoloStatusText(result.yolo_detected)}</span>
            </div>
            <div className="result-field">
              <span className="result-field-label">Source</span>
              <span className="result-field-value">{sourceLabel}</span>
            </div>
            <div className="result-field">
              <span className="result-field-label">Mode</span>
              <span className="result-field-value">{modeLabel}</span>
            </div>
            {adminName && (
              <div className="result-field">
                <span className="result-field-label">Recherché par</span>
                <span className="result-field-value">{adminName}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="result-field">
              <span className="result-field-label">Images analysées</span>
              <span className="result-field-value">
                {result.images_analyzed ?? result.cameras_scanned ?? 'Toutes les images locales'}
              </span>
            </div>
            <div className="result-field">
              <span className="result-field-label">Source</span>
              <span className="result-field-value">{sourceLabel}</span>
            </div>
          </>
        )}
      </div>

      {isDetected && evidenceUrl && (
        <div className="result-evidence-preview mcv-img-zoom">
          <img src={resolveAiAssetUrl(evidenceUrl)} alt="Preuve détection" className="result-evidence-thumb" />
        </div>
      )}

      {!foundEffective && (
        <div className="result-tips">
          <p className="result-tips-title">Conseils :</p>
          <ul>
            <li>Vérifiez que le code saisi est correct (ex. 79943, MSCU7894563)</li>
            <li>
              {result.images_analyzed != null
                ? `${result.images_analyzed} image(s) caméra analysée(s) sans correspondance`
                : 'Relancez l\'analyse — le conteneur peut ne pas être visible sur les images actuelles'}
            </li>
            <li>Les caméras RTSP ne sont pas connectées en mode simulation</li>
          </ul>
        </div>
      )}

      <div className="result-actions">
        {isDetected && evidenceUrl && (
          <button
            type="button"
            className="mcv-btn mcv-btn--primary result-action-btn"
            onClick={() => setShowEvidence(true)}
          >
            &#128247; Voir preuve
          </button>
        )}
        {onReanalyze && (
          <button
            type="button"
            className="mcv-btn mcv-btn--secondary result-action-btn"
            onClick={() => onReanalyze(result.searched_code)}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="mcv-btn-spinner" aria-hidden="true" />
                Analyse...
              </>
            ) : (
              <>&#128260; Relancer l&apos;analyse</>
            )}
          </button>
        )}
      </div>

      <OcrQualityPanel data={result} />

      {(result.last_position || (result.movements && result.movements.length > 0) || (result.alerts && result.alerts.length > 0)) && (
        <ContainerTracking
          lastPosition={result.last_position}
          movements={result.movements}
          alerts={result.alerts}
          liveDetected={isDetected}
        />
      )}

      <div className="result-footer">
        Mode simulation : analyse sur images locales. YOLO est optionnel ; l&apos;OCR lit le code.
        Ce résultat peut être utilisé par le bot WhatsApp.
      </div>

      {showEvidence && (
        <EvidenceModal
          imagePath={result.evidence_image_url || result.image_path}
          annotatedPath={result.annotated_image_url}
          onClose={() => setShowEvidence(false)}
        />
      )}
    </div>
  );
}

export default ResultCard;
