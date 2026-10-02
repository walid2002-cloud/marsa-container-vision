import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

function LoginPage() {
  const { login, verifyMfa, completePasswordChange } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState(null);
  const [changeToken, setChangeToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(email, password);
      if (res.password_change_required) {
        setChangeToken(res.change_token);
      } else if (res.mfa_required) {
        setMfaToken(res.mfa_token);
      } else if (!res.success) {
        setError(res.error || 'Identifiants incorrects.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Impossible de se connecter au serveur.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await verifyMfa(mfaToken, otp);
      if (!res.success) {
        setError(res.error || 'Code MFA invalide.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Code MFA invalide.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const res = await completePasswordChange(changeToken, newPassword, password);
      if (!res.success) setError(res.error || 'Impossible de changer le mot de passe.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur changement mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  const subtitle = changeToken
    ? 'Votre mot de passe a expiré — choisissez un nouveau mot de passe'
    : mfaToken
      ? 'Vérification en deux étapes (MFA)'
      : 'Connectez-vous pour accéder au système';

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img
            className="login-brand-logo"
            src={`${process.env.PUBLIC_URL}/marsa-maroc-logo.png`}
            alt="Marsa Maroc"
            width={200}
            height={80}
          />
          <h1>Marsa Maroc</h1>
          <p>{subtitle}</p>
        </div>

        {changeToken ? (
          <form className="login-form" onSubmit={handlePasswordChange}>
            {error && <div className="login-error"><span>&#9888;</span> {error}</div>}
            <p className="login-hint">Minimum 9 caractères, majuscule, minuscule, chiffre, caractère spécial.</p>
            <div className="form-group">
              <label htmlFor="new-password">Nouveau mot de passe</label>
              <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={9} />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Confirmer</label>
              <input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <button type="submit" className="login-button" disabled={loading}>{loading ? 'Mise à jour…' : 'Changer et se connecter'}</button>
          </form>
        ) : !mfaToken ? (
          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="login-error">
                <span>&#9888;</span> {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@marsamaroc.com"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                required
                disabled={loading}
              />
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Se connecter'}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleMfaSubmit}>
            {error && (
              <div className="login-error">
                <span>&#9888;</span> {error}
              </div>
            )}
            <div className="form-group">
              <label htmlFor="otp">Code d'authentification (6 chiffres) ou code de secours</label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                required
                disabled={loading}
                autoFocus
              />
            </div>
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Valider le code'}
            </button>
            <button
              type="button"
              className="login-button login-button--secondary"
              onClick={() => { setMfaToken(null); setOtp(''); setError(''); }}
              disabled={loading}
            >
              Retour
            </button>
          </form>
        )}

        <div className="login-footer">
          <span className="prototype-tag">Mode prototype</span>
          <p>Marsa Maroc &copy; 2026</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
