import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { changePassword } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './SecurityPages.css';

function ChangePasswordPage() {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (next !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const res = await changePassword({ current_password: current, new_password: next });
      if (res.success) {
        setOk('Mot de passe mis à jour.');
        await refreshProfile();
        setTimeout(() => navigate('/profile'), 1500);
      } else {
        setError(res.error || 'Erreur');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de changer le mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <section className="mcv-section-card">
          <h2 className="section-title">Changer mot de passe</h2>
          <p className="section-description">
            Minimum 9 caractères, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial. Expiration : 30 jours.
          </p>
          {error && <div className="error-banner">{error}</div>}
          {ok && <div className="success-banner">{ok}</div>}
          <form className="sec-form" onSubmit={handleSubmit}>
            <label>Mot de passe actuel<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
            <label>Nouveau mot de passe<input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={9} /></label>
            <label>Confirmer<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
            <button type="submit" className="sec-btn" disabled={loading}>{loading ? 'En cours…' : 'Mettre à jour'}</button>
          </form>
        </section>
      </main>
    </>
  );
}

export default ChangePasswordPage;
