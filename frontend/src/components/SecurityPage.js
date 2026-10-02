import React, { useState } from 'react';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import { useAuth } from '../contexts/AuthContext';
import { mfaSetup, mfaEnable, mfaDisable } from '../services/api';
import './SecurityPages.css';

function SecurityPage() {
  const { admin, refreshProfile } = useAuth();
  const [setup, setSetup] = useState(null); // { secret, otpauth_url, qr_data_url }
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const mfaEnabled = !!admin?.mfa_enabled;

  const flash = (msg) => { setMessage(msg); setError(null); };
  const fail = (msg) => { setError(msg); setMessage(null); };

  const handleSetup = async () => {
    setBusy(true); setError(null);
    try {
      const res = await mfaSetup();
      if (res.success) setSetup(res.data);
      else fail(res.error || 'Échec du setup MFA.');
    } catch (e) { fail(e.response?.data?.error || 'Échec du setup MFA.'); }
    finally { setBusy(false); }
  };

  const handleEnable = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await mfaEnable(code);
      if (res.success) {
        setBackupCodes(res.data.backup_codes || []);
        setSetup(null); setCode('');
        flash('MFA activé avec succès.');
        await refreshProfile();
      } else fail(res.error || 'Code invalide.');
    } catch (e2) { fail(e2.response?.data?.error || 'Code invalide.'); }
    finally { setBusy(false); }
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await mfaDisable({ code, password });
      if (res.success) {
        setCode(''); setPassword(''); setBackupCodes(null);
        flash('MFA désactivé.');
        await refreshProfile();
      } else fail(res.error || 'Action impossible.');
    } catch (e2) { fail(e2.response?.data?.error || 'Action impossible.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />
        <section className="mcv-section-card sec-mfa">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128272;</span>
              Sécurité du compte — MFA
            </h2>
          </div>

          <div className="sec-account">
            <p><strong>Utilisateur :</strong> {admin?.full_name} ({admin?.email})</p>
            <p><strong>Rôles :</strong> {(admin?.roles || []).join(', ') || admin?.role}</p>
            <p>
              <strong>MFA :</strong>{' '}
              <span className={`sec-badge ${mfaEnabled ? 'sec-badge--ok' : 'sec-badge--muted'}`}>
                {mfaEnabled ? 'Activé' : 'Désactivé'}
              </span>
            </p>
          </div>

          {message && <div className="sec-message sec-message--ok">{message}</div>}
          {error && <div className="sec-message sec-message--err">{error}</div>}

          {backupCodes && (
            <div className="sec-backup">
              <h4>Codes de secours (à conserver précieusement)</h4>
              <div className="sec-backup-codes">
                {backupCodes.map((c) => <code key={c}>{c}</code>)}
              </div>
              <p className="sec-hint">Chaque code n'est utilisable qu'une seule fois.</p>
            </div>
          )}

          {!mfaEnabled && !setup && (
            <button className="sec-btn sec-btn--primary" onClick={handleSetup} disabled={busy}>
              {busy ? 'Génération…' : 'Activer le MFA'}
            </button>
          )}

          {!mfaEnabled && setup && (
            <div className="sec-setup">
              <p>Scannez ce QR code avec Google Authenticator / Authy, puis saisissez le code généré.</p>
              {setup.qr_data_url && <img className="sec-qr" src={setup.qr_data_url} alt="QR code MFA" />}
              <p className="sec-hint">Clé secrète manuelle : <code>{setup.secret}</code></p>
              <form className="sec-inline-form" onSubmit={handleEnable}>
                <input
                  type="text" inputMode="numeric" placeholder="Code à 6 chiffres"
                  value={code} onChange={(e) => setCode(e.target.value)} required
                />
                <button className="sec-btn sec-btn--primary" disabled={busy}>Confirmer</button>
              </form>
            </div>
          )}

          {mfaEnabled && (
            <form className="sec-inline-form" onSubmit={handleDisable}>
              <p>Pour désactiver le MFA, saisissez un code OTP ou votre mot de passe.</p>
              <input type="text" inputMode="numeric" placeholder="Code OTP" value={code} onChange={(e) => setCode(e.target.value)} />
              <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="sec-btn sec-btn--danger" disabled={busy}>Désactiver le MFA</button>
            </form>
          )}
        </section>
      </main>
    </>
  );
}

export default SecurityPage;
