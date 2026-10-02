import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import './DemoPage.css';

const DEMO_CODES = ['MSCU998765', 'MSCU7894563', '79943'];

const SCENARIOS = [
  {
    n: 1,
    icon: '🔍',
    title: 'Rechercher un conteneur connu',
    desc: 'Saisir un code conteneur dans la recherche pour lancer l\'analyse des caméras et obtenir la zone, la caméra et le score de confiance.',
    action: { label: 'Ouvrir la recherche', to: '/search' },
  },
  {
    n: 2,
    icon: '📍',
    title: 'Afficher la dernière position connue',
    desc: 'Ouvrir la fiche détail d\'un conteneur pour voir sa dernière position, le temps écoulé et le badge « à vérifier ».',
    action: { label: 'Fiche conteneur', detail: true },
  },
  {
    n: 3,
    icon: '🕘',
    title: 'Voir l\'historique des déplacements',
    desc: 'La fiche conteneur affiche la timeline complète des déplacements avec caméra, zone et horodatage.',
    action: { label: 'Fiche conteneur', detail: true },
  },
  {
    n: 4,
    icon: '🗺️',
    title: 'Voir sur la carte du terminal',
    desc: 'La carte schématique met en évidence la zone et la caméra associées au conteneur recherché.',
    action: { label: 'Carte terminal', to: '/terminal-map' },
  },
  {
    n: 5,
    icon: '⚠️',
    title: 'Voir une alerte (position ancienne / OCR)',
    desc: 'La page Alertes liste les situations intelligentes : position trop ancienne, OCR incertain, mauvaise zone, immobilisation.',
    action: { label: 'Page alertes', to: '/alerts' },
  },
  {
    n: 6,
    icon: '📤',
    title: 'Voir une notification simulée',
    desc: 'Les notifications multi-canal (WhatsApp, Email, SMS) sont générées à partir des alertes et consultables ici.',
    action: { label: 'Notifications', to: '/notifications' },
  },
  {
    n: 7,
    icon: '🔗',
    title: 'Tester l\'API d\'intégration',
    desc: 'L\'endpoint POST /api/integrations/container-search renvoie une réponse JSON complète pour Marsa Maroc AI / WhatsApp.',
    action: { label: 'Voir l\'exemple API', anchor: 'api' },
  },
];

const CURL_EXAMPLE = `curl -X POST https://VOTRE_DOMAINE/api/integrations/container-search \\
  -H "Content-Type: application/json" \\
  -H "x-integration-key: VOTRE_CLE" \\
  -d '{
    "container_code": "MSCU998765",
    "source": "whatsapp",
    "include_history": true,
    "include_alerts": true,
    "include_map": true,
    "include_proof": true
  }'`;

function DemoPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState(DEMO_CODES[0]);
  const [copied, setCopied] = useState(false);

  const goDetail = () => navigate(`/containers/${encodeURIComponent(code.trim())}`);
  const goMap = () => navigate(`/terminal-map?code=${encodeURIComponent(code.trim())}`);

  const runAction = (action) => {
    if (action.detail) return goDetail();
    if (action.anchor) {
      document.getElementById(action.anchor)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (action.to) navigate(action.to);
  };

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(CURL_EXAMPLE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <>
      <Header />
      <main className="main-content mcv-page demo-page">
        <section className="mcv-section-card demo-hero">
          <h2 className="section-title">
            <span className="mcv-section-icon" aria-hidden="true">🎓</span>
            Démo jury — Marsa Container Vision
          </h2>
          <p className="section-description">
            Parcours guidé pour présenter les fonctionnalités clés : recherche, suivi, carte,
            alertes intelligentes, notifications et API d&apos;intégration.
          </p>

          <div className="demo-code-bar">
            <label htmlFor="demo-code">Conteneur de démonstration</label>
            <div className="demo-code-row">
              <input
                id="demo-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="demo-input"
                placeholder="MSCU998765"
              />
              <button type="button" className="demo-btn demo-btn--primary" onClick={goDetail}>Fiche conteneur</button>
              <button type="button" className="demo-btn demo-btn--secondary" onClick={goMap}>Voir sur la carte</button>
            </div>
            <div className="demo-code-suggestions">
              {DEMO_CODES.map((c) => (
                <button key={c} type="button" className="demo-chip" onClick={() => setCode(c)}>{c}</button>
              ))}
            </div>
          </div>
        </section>

        <section className="demo-scenarios">
          {SCENARIOS.map((s) => (
            <article key={s.n} className="mcv-section-card demo-scenario">
              <div className="demo-scenario-head">
                <span className="demo-scenario-num">{s.n}</span>
                <span className="demo-scenario-icon" aria-hidden="true">{s.icon}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              <button type="button" className="demo-btn demo-btn--ghost" onClick={() => runAction(s.action)}>
                {s.action.label} &rarr;
              </button>
            </article>
          ))}
        </section>

        <section className="mcv-section-card demo-api" id="api">
          <h3 className="an-section-title">Exemple API d&apos;intégration (Marsa Maroc AI)</h3>
          <p className="section-description">
            Endpoint protégé par l&apos;en-tête <code>x-integration-key</code>. La réponse contient le statut
            (detected / known_position / uncertain / not_found), la preuve visuelle, la carte et les alertes.
          </p>
          <div className="demo-code-block">
            <button type="button" className="demo-copy" onClick={copyCurl}>
              {copied ? 'Copié ✓' : 'Copier'}
            </button>
            <pre>{CURL_EXAMPLE}</pre>
          </div>
          <p className="demo-note">
            Documentation complète : <code>docs/integration_api.md</code>.
          </p>
        </section>
      </main>
    </>
  );
}

export default DemoPage;
