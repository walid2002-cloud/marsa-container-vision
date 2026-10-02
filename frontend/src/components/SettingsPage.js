import React, { useEffect, useState } from 'react';
import Header from './Header';
import { useAuth } from '../contexts/AuthContext';
import { getSettings, updateSettings } from '../services/api';
import PrototypeBanner from './PrototypeBanner';
import './SecurityPages.css';

function SettingsPage() {
  const { hasPermission } = useAuth();
  const [settings, setSettings] = useState({ app_mode: 'DEMO', marsa_ai_url: '' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getSettings().then((r) => { if (r.success) setSettings(r.data); }).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      const res = await updateSettings(settings);
      if (res.success) {
        setSettings(res.data);
        setMsg('Paramètres enregistrés.');
      }
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Erreur');
    }
  };

  if (!hasPermission('settings.manage')) {
    return <><Header /><main className="main-content"><p>Accès refusé.</p></main></>;
  }

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />
        <section className="mcv-section-card">
          <h2 className="section-title">Configuration système</h2>
          <p className="section-description">
            Mode simulation : images locales. Mode production : caméras RTSP enregistrées.
          </p>
          {msg && <div className="success-banner">{msg}</div>}
          {err && <div className="error-banner">{err}</div>}
          <form className="sec-form" onSubmit={save}>
            <label>
              Mode application
              <select value={settings.app_mode || 'DEMO'} onChange={(e) => setSettings({ ...settings, app_mode: e.target.value })}>
                <option value="DEMO">Simulation — images locales</option>
                <option value="PRODUCTION">Production — caméras RTSP réelles</option>
              </select>
            </label>
            <label>
              URL Marsa Maroc AI
              <input
                type="url"
                placeholder="http://localhost:5173"
                value={settings.marsa_ai_url || ''}
                onChange={(e) => setSettings({ ...settings, marsa_ai_url: e.target.value })}
              />
            </label>
            <button type="submit" className="sec-btn">Enregistrer</button>
          </form>
        </section>
      </main>
    </>
  );
}

export default SettingsPage;
