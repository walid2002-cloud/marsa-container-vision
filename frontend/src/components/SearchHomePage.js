import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import SearchBar from './SearchBar';
import ResultCard from './ResultCard';
import HistoryTable from './HistoryTable';
import PrototypeBanner from './PrototypeBanner';
import { useAuth } from '../contexts/AuthContext';
import { searchContainer, getSearchHistory } from '../services/api';

function SearchHomePage() {
  const { admin } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await getSearchHistory();
      if (res.success) {
        setHistory(res.data);
      }
    } catch {
      // non-blocking
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSearch = async (code) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await searchContainer(code);

      if (response.success) {
        setResult(response.data);
        loadHistory();
      } else {
        setError(response.error || 'Erreur inconnue');
      }
    } catch (err) {
      const message =
        err.response?.data?.error ||
        'Impossible de communiquer avec le serveur. Vérifiez que le backend est démarré.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReanalyze = (code) => {
    handleSearch(code);
  };

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />

        <section className="mcv-section-card search-section">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128269;</span>
              Recherche de conteneur
            </h2>
            <p className="section-description">
              Saisissez le code conteneur : le système vérifie les caméras simulées, lance OCR
              et YOLO (si activé), puis affiche caméra, zone, confiance et image preuve.
            </p>
          </div>
          <p className="mcv-hint-box">
            Mode simulation : les caméras RTSP ne sont pas connectées — les analyses utilisent des images
            locales. YOLO est une couche optionnelle ; l&apos;OCR reste responsable de la lecture du code.
            Les résultats alimentent l&apos;historique et le bot WhatsApp « Bot Conteneur ».
          </p>
          <SearchBar onSearch={handleSearch} loading={loading} />
        </section>

        {loading && (
          <div className="mcv-progress-banner" role="status">
            <span className="spinner" aria-hidden="true" />
            Analyse des caméras actives en cours… (OCR + YOLO si activé)
          </div>
        )}

        {error && (
          <div className="error-banner" role="alert">
            <span className="error-icon">&#9888;</span>
            {error}
          </div>
        )}

        {result && (
          <ResultCard
            result={result}
            adminName={admin?.full_name}
            onReanalyze={handleReanalyze}
            loading={loading}
          />
        )}

        <section className="mcv-section-card history-section">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128203;</span>
              Historique des recherches
            </h2>
            <p className="section-description">
              Toutes les recherches effectuées sont enregistrées en base de données.
            </p>
          </div>
          <HistoryTable history={history} loading={historyLoading} />
        </section>
      </main>

      <footer className="app-footer">
        <p>Marsa Container Vision &mdash; Marsa Maroc &copy; 2026</p>
      </footer>
    </>
  );
}

export default SearchHomePage;
