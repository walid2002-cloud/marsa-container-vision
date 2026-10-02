import React, { useState, useEffect } from 'react';
import { checkHealth, getSettings } from '../services/api';
import './PrototypeBanner.css';

const MODE_CONFIG = {
  mock: {
    icon: '\u26A0',
    title: 'Mode simulation',
    chip: 'SIMULATION',
    chipClass: 'proto-chip-mock',
    bannerClass: 'proto-mock',
    description: 'La détection est simulée via une liste fixe. YOLO, OCR et caméras RTSP ne sont pas connectés.',
  },
  demo: {
    icon: '\uD83D\uDDBC',
    title: 'Mode simulation — images locales',
    chip: 'SIMULATION',
    chipClass: 'proto-chip-demo',
    bannerClass: 'proto-demo',
    description:
      'Les caméras RTSP ne sont pas connectées. Les analyses utilisent des images locales (ou frames vidéo). ' +
      'YOLO est optionnel ; l\'OCR reste responsable de la lecture du code.',
  },
  production: {
    icon: '\u2705',
    title: 'Mode production — caméras RTSP connectées',
    chip: 'PRODUCTION',
    chipClass: 'proto-chip-real',
    bannerClass: 'proto-real',
    description: 'La détection utilise les caméras RTSP enregistrées. Aucune image simulée n\'est présentée comme réelle.',
  },
  real: {
    icon: '\u2705',
    title: 'Mode production — caméras RTSP connectées',
    chip: 'PRODUCTION',
    chipClass: 'proto-chip-real',
    bannerClass: 'proto-real',
    description: 'La détection utilise les caméras RTSP, YOLO et OCR en temps réel.',
  },
};

function PrototypeBanner() {
  const [mode, setMode] = useState('demo');
  const [demoCount, setDemoCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([checkHealth(), getSettings().catch(() => null)])
      .then(([health, settingsRes]) => {
        if (cancelled) return;
        const appMode = settingsRes?.data?.app_mode;
        if (appMode === 'PRODUCTION') {
          setMode('production');
        } else if (health?.detection_mode) {
          setMode(health.detection_mode);
        }
        if (health?.demo_images_count != null) setDemoCount(health.demo_images_count);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.demo;

  return (
    <div className={`prototype-banner ${cfg.bannerClass}`}>
      <div className="prototype-banner-inner">
        <span className="prototype-banner-icon">{cfg.icon}</span>
        <div className="proto-text">
          <div className="proto-header">
            <strong>{cfg.title}</strong>
            <span className={`proto-chip ${cfg.chipClass}`}>{cfg.chip}</span>
          </div>
          <p>{cfg.description}</p>
          {mode === 'demo' && demoCount > 0 && (
            <p className="proto-exp">
              {demoCount} image{demoCount > 1 ? 's' : ''} de test disponible{demoCount > 1 ? 's' : ''}.
              Les résultats peuvent être utilisés par le bot WhatsApp.
            </p>
          )}
          {mode === 'demo' && demoCount === 0 && (
            <p className="proto-exp proto-exp-warn">
              Aucune image de test dans le dossier local. Ajoutez des photos de conteneurs pour tester.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default PrototypeBanner;
