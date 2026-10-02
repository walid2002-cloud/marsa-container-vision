import React, { useState } from 'react';
import './HistoryTable.css';
import { resolveAiAssetUrl, sourceChannelLabel, detectionModeLabel } from '../utils/detectionDisplay';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EvidenceButton({ path }) {
  const [open, setOpen] = useState(false);
  if (!path) return <span className="h-no-proof">Aucune</span>;
  const url = resolveAiAssetUrl(path);
  return (
    <>
      <button type="button" className="mcv-btn mcv-btn--ghost h-proof-btn" onClick={() => setOpen(true)}>
        Voir preuve
      </button>
      {open && (
        <div className="evidence-overlay h-proof-overlay" onClick={() => setOpen(false)}>
          <div className="evidence-modal h-proof-modal" onClick={(e) => e.stopPropagation()}>
            <img src={url} alt="Preuve" className="evidence-image" />
            <button type="button" className="mcv-btn mcv-btn--secondary" onClick={() => setOpen(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function HistoryTable({ history, loading }) {
  if (loading) {
    return (
      <div className="history-state">
        <span className="spinner" aria-hidden="true" />
        <span>Chargement de l&apos;historique...</span>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="mcv-empty history-empty">
        <span className="mcv-empty-icon" aria-hidden="true">&#128203;</span>
        <strong>Aucune recherche enregistrée</strong>
        <p>Les résultats apparaîtront ici après une première recherche de conteneur.</p>
      </div>
    );
  }

  return (
    <div className="history-table-wrapper">
      <table className="history-table">
        <thead>
          <tr>
            <th>Code recherché</th>
            <th>Résultat</th>
            <th>Caméra</th>
            <th>Zone</th>
            <th>Confiance</th>
            <th>Source</th>
            <th>Mode</th>
            <th>Preuve</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry, index) => (
            <tr key={entry.id || index}>
              <td className="code-cell">{entry.searched_code}</td>
              <td>
                <span
                  className={`h-badge ${
                    entry.result === 'detected' ? 'h-badge-detected' : 'h-badge-not-detected'
                  }`}
                >
                  <span className="h-badge-dot" aria-hidden="true" />
                  {entry.result === 'detected' ? 'Détecté' : 'Non détecté'}
                </span>
              </td>
              <td>{entry.camera_name || (entry.result === 'detected' ? '—' : 'N/A')}</td>
              <td>{entry.zone || (entry.result === 'detected' ? '—' : 'N/A')}</td>
              <td className="confidence-cell">
                {entry.confidence != null && Number(entry.confidence) > 0
                  ? `${(Number(entry.confidence) * 100).toFixed(1)}%`
                  : entry.global_confidence != null
                    ? `${(Number(entry.global_confidence) * 100).toFixed(1)}%`
                    : '—'}
              </td>
              <td className="source-cell">{sourceChannelLabel(entry.source)}</td>
              <td>{detectionModeLabel(entry.detection_mode, entry.source_match)}</td>
              <td><EvidenceButton path={entry.evidence_path} /></td>
              <td className="date-cell">{formatDate(entry.searched_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="history-count">
        {history.length} recherche{history.length > 1 ? 's' : ''}
      </div>
    </div>
  );
}

export default HistoryTable;
