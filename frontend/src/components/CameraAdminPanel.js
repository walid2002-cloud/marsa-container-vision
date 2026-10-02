import React, { useState } from 'react';
import {
  createCamera,
  updateCamera,
  deleteCamera,
  testCamera,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './LiveCamerasPage.css';

const EMPTY = {
  camera_id: '',
  name: '',
  zone: '',
  rtsp_url: '',
  rtsp_username: '',
  rtsp_password: '',
  scan_interval_seconds: 5,
  active: true,
};

function CameraAdminPanel({ cameras, onRefresh }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('cameras.manage');
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [testingId, setTestingId] = useState(null);

  if (!canManage) return null;

  const openNew = () => setForm({ ...EMPTY });
  const openEdit = (cam) => setForm({
    camera_id: cam.id,
    name: cam.name || cam.id,
    zone: cam.zone || '',
    rtsp_url: '',
    rtsp_username: '',
    rtsp_password: '',
    scan_interval_seconds: cam.scan_interval_seconds || 5,
    active: cam.status !== 'inactive' && cam.active !== false,
    _edit: true,
    rtsp_configured: cam.rtsp_configured,
  });

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      const payload = {
        camera_id: form.camera_id,
        name: form.name,
        zone: form.zone,
        rtsp_url: form.rtsp_url || undefined,
        rtsp_username: form.rtsp_username || undefined,
        scan_interval_seconds: Number(form.scan_interval_seconds) || 5,
        active: form.active,
      };
      if (form.rtsp_password) payload.rtsp_password = form.rtsp_password;
      if (form._edit) await updateCamera(form.camera_id, payload);
      else await createCamera(payload);
      setMsg(form._edit ? 'Caméra mise à jour.' : 'Caméra ajoutée.');
      setForm(null);
      onRefresh();
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Erreur enregistrement');
    }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    setErr(null);
    setMsg(null);
    try {
      const res = await testCamera(id);
      if (res.success && res.online) {
        setMsg(`RTSP OK — ${id} (${res.latencyMs ?? '?'} ms)`);
      } else {
        setErr(res.error || 'Test RTSP échoué');
      }
      onRefresh();
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Caméra inaccessible');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Désactiver / supprimer la caméra ${id} ?`)) return;
    await deleteCamera(id);
    onRefresh();
  };

  return (
    <section className="mcv-section-card lc-admin-panel">
      <div className="lc-admin-head">
        <div>
          <h2 className="section-title">Administration des caméras</h2>
          <p className="section-description">
            Configurez les caméras RTSP Marsa Maroc. Le mot de passe RTSP n&apos;est jamais renvoyé au navigateur.
          </p>
        </div>
        <button type="button" className="mcv-btn mcv-btn--primary" onClick={openNew}>+ Ajouter une caméra</button>
      </div>

      {msg && <div className="mcv-success-banner">{msg}</div>}
      {err && <div className="error-banner">{err}</div>}

      <div className="lc-admin-table-wrap">
        <table className="lc-admin-table">
          <thead>
            <tr>
              <th>ID</th><th>Nom</th><th>Zone</th><th>Type</th><th>Statut</th>
              <th>RTSP</th><th>Dernier test</th><th>Dernier conteneur</th><th>Confiance</th>
              <th>Intervalle</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((cam) => (
              <tr key={cam.id}>
                <td><code>{cam.id}</code></td>
                <td>{cam.name}</td>
                <td>{cam.zone || '—'}</td>
                <td>{cam.type || 'rtsp'}</td>
                <td>
                  <span className={`lc-admin-status lc-admin-status--${cam.status || 'active'}`}>
                    {cam.status || 'active'}
                  </span>
                </td>
                <td>{cam.rtsp_configured ? 'Oui' : 'Non'}</td>
                <td>
                  {cam.last_test_at
                    ? `${cam.last_test_ok ? '✓' : '✗'} ${new Date(cam.last_test_at).toLocaleString('fr-FR')}`
                    : '—'}
                </td>
                <td>{cam.last_container || '—'}</td>
                <td>{cam.last_confidence != null ? `${(cam.last_confidence * 100).toFixed(0)}%` : '—'}</td>
                <td>{cam.scan_interval_seconds || 5}s</td>
                <td className="lc-admin-actions">
                  <button type="button" className="mcv-btn mcv-btn--ghost" onClick={() => openEdit(cam)}>Modifier</button>
                  <button type="button" className="mcv-btn mcv-btn--secondary" disabled={testingId === cam.id} onClick={() => handleTest(cam.id)}>
                    {testingId === cam.id ? '…' : 'Tester RTSP'}
                  </button>
                  <button type="button" className="mcv-btn mcv-btn--ghost" onClick={() => handleDelete(cam.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="lc-modal-backdrop" role="dialog" aria-modal="true">
          <form className="lc-modal" onSubmit={save}>
            <h3>{form._edit ? 'Modifier la caméra' : 'Ajouter une caméra RTSP'}</h3>
            {!form._edit && (
              <label>Identifiant<input required value={form.camera_id} onChange={(e) => setForm({ ...form, camera_id: e.target.value.toUpperCase() })} placeholder="CAM_05" /></label>
            )}
            <label>Nom caméra<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Zone<input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /></label>
            <label>
              RTSP URL
              <input value={form.rtsp_url} onChange={(e) => setForm({ ...form, rtsp_url: e.target.value })} placeholder="rtsp://192.168.1.100:554/stream1" />
              {form._edit && form.rtsp_configured && <small>Laissez vide pour conserver l&apos;URL existante.</small>}
            </label>
            <label>Username RTSP<input value={form.rtsp_username} onChange={(e) => setForm({ ...form, rtsp_username: e.target.value })} autoComplete="off" /></label>
            <label>Password RTSP<input type="password" value={form.rtsp_password} onChange={(e) => setForm({ ...form, rtsp_password: e.target.value })} autoComplete="new-password" placeholder={form._edit ? '••••••••' : ''} /></label>
            <label>Intervalle analyse (s)<input type="number" min={1} max={3600} value={form.scan_interval_seconds} onChange={(e) => setForm({ ...form, scan_interval_seconds: e.target.value })} /></label>
            <label className="lc-check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activer la caméra</label>
            <div className="lc-modal-actions">
              <button type="button" className="mcv-btn mcv-btn--ghost" onClick={() => setForm(null)}>Annuler</button>
              <button type="submit" className="mcv-btn mcv-btn--primary">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default CameraAdminPanel;
