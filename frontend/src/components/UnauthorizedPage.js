import React from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import './SecurityPages.css';

function UnauthorizedPage() {
  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />
        <section className="mcv-section-card sec-unauthorized">
          <div className="sec-unauthorized-icon" aria-hidden="true">&#128274;</div>
          <h2 className="section-title">Accès non autorisé</h2>
          <p>Vous ne disposez pas des permissions nécessaires pour consulter cette page.</p>
          <p>Contactez un administrateur si vous pensez qu'il s'agit d'une erreur.</p>
          <Link to="/dashboard" className="sec-btn sec-btn--primary">Retour au dashboard</Link>
        </section>
      </main>
    </>
  );
}

export default UnauthorizedPage;
