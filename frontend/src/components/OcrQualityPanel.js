import React, { useState } from 'react';
import './OcrQualityPanel.css';
import {
  ocrQualityMeta,
  matchTypeLabel,
  orientationLabel,
  yoloModeMeta,
  yoloModeWarning,
  formatScore,
} from '../utils/ocrDisplay';

/**
 * Phase 5 — Panneau OCR avancé + YOLO.
 * Affiche : qualité OCR, code détecté, score/type de match, badges
 * (code partiel / OCR à vérifier), orientation, mode YOLO, et texte OCR brut
 * dans un bloc dépliable.
 *
 * Props : data = objet réponse (search / upload / camera) contenant les champs
 * ocr_quality, matched_code / detected_code, match_score, match_type,
 * partial_code_detected, raw_ocr_text, normalized_codes, orientation,
 * yolo_model_mode.
 */
function OcrQualityPanel({ data, compact = false }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!data) return null;

  const quality = data.ocr_quality || null;
  const qMeta = ocrQualityMeta(quality);
  const matchedCode = data.matched_code || data.detected_code || null;
  const scoreTxt = formatScore(data.match_score);
  const partial = Boolean(data.partial_code_detected);
  const suspicious = quality === 'faible' || quality === 'à vérifier';
  const yMode = data.yolo_model_mode || null;
  const yMeta = yoloModeMeta(yMode);
  const yWarn = yoloModeWarning(yMode);
  const orientation = data.orientation || null;
  const rawText = data.raw_ocr_text || null;
  const normalizedCodes = Array.isArray(data.normalized_codes) ? data.normalized_codes : [];

  const hasAnything =
    quality || matchedCode || scoreTxt || partial || yMeta || rawText || normalizedCodes.length;
  if (!hasAnything) return null;

  return (
    <div className={`ocrq-panel ${compact ? 'ocrq-compact' : ''}`}>
      <div className="ocrq-title">
        <span className="ocrq-title-icon">&#128269;</span>
        Analyse OCR / YOLO
      </div>

      <div className="ocrq-badges">
        {qMeta && (
          <span className={`ocrq-badge ${qMeta.cls}`}>
            {qMeta.icon} Qualité OCR : {qMeta.label}
          </span>
        )}
        {partial && <span className="ocrq-badge ocrq-partial">&#9986; Code partiel</span>}
        {suspicious && <span className="ocrq-badge ocrq-unsure">&#128269; OCR à vérifier</span>}
      </div>

      <div className="ocrq-grid">
        {matchedCode && (
          <div className="ocrq-field">
            <span className="ocrq-label">Code détecté</span>
            <span className="ocrq-value ocrq-code">{matchedCode}</span>
          </div>
        )}
        {scoreTxt && (
          <div className="ocrq-field">
            <span className="ocrq-label">Score de matching</span>
            <span className="ocrq-value">{scoreTxt}</span>
          </div>
        )}
        {data.match_type && (
          <div className="ocrq-field">
            <span className="ocrq-label">Type de match</span>
            <span className="ocrq-value">{matchTypeLabel(data.match_type)}</span>
          </div>
        )}
        {orientation && (
          <div className="ocrq-field">
            <span className="ocrq-label">Orientation</span>
            <span className="ocrq-value">{orientationLabel(orientation)}</span>
          </div>
        )}
        {yMeta && (
          <div className="ocrq-field">
            <span className="ocrq-label">Mode YOLO</span>
            <span className={`ocrq-value ocrq-yolo ${yMeta.cls}`}>{yMeta.label}</span>
          </div>
        )}
      </div>

      {yWarn && <p className="ocrq-warning">&#9888;&#65039; {yWarn}</p>}

      {normalizedCodes.length > 0 && (
        <div className="ocrq-codes">
          <span className="ocrq-label">Codes normalisés :</span>{' '}
          {normalizedCodes.map((c) => (
            <code key={c} className="ocrq-chip">{c}</code>
          ))}
        </div>
      )}

      {rawText && (
        <div className="ocrq-raw">
          <button
            type="button"
            className="ocrq-raw-toggle"
            onClick={() => setShowRaw((s) => !s)}
          >
            {showRaw ? '\u25BC' : '\u25B6'} Texte OCR brut
          </button>
          {showRaw && <pre className="ocrq-raw-text">{rawText}</pre>}
        </div>
      )}
    </div>
  );
}

export default OcrQualityPanel;
