import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import { useAuth } from '../contexts/AuthContext';
import { getRoles, getPermissions, setRolePermissions } from '../services/api';
import './SecurityPages.css';

function RolesPage() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [editing, setEditing] = useState(null); // roleId
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const canManage = hasPermission('roles.manage');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [rRes, pRes] = await Promise.all([getRoles(), getPermissions()]);
      if (rRes.success) setRoles(rRes.data);
      if (pRes.success) setPermissions(pRes.data);
    } catch (e) {
      setMessage(e.response?.data?.error || 'Impossible de charger les rôles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 4000); };

  const startEdit = (role) => {
    setEditing(role.id);
    setSelected(role.permissions || []);
  };

  const toggle = (perm) => {
    setSelected((s) => (s.includes(perm) ? s.filter((p) => p !== perm) : [...s, perm]));
  };

  const save = async (role) => {
    setBusy(true);
    try {
      const res = await setRolePermissions(role.id, selected);
      if (res.success) { flash('Permissions mises à jour.'); setEditing(null); await load(); }
      else flash(res.error || 'Échec.');
    } catch (e) { flash(e.response?.data?.error || 'Échec.'); }
    finally { setBusy(false); }
  };

  // Grouper les permissions par catégorie.
  const grouped = permissions.reduce((acc, p) => {
    const cat = p.category || 'Autres';
    (acc[cat] = acc[cat] || []).push(p);
    return acc;
  }, {});

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />
        <section className="mcv-section-card">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128273;</span>
              Rôles &amp; permissions
            </h2>
          </div>

          {message && <div className="sec-message">{message}</div>}

          {loading ? (
            <div className="sec-loading"><span className="spinner" /> Chargement…</div>
          ) : (
            <div className="sec-roles">
              {roles.map((role) => (
                <div key={role.id} className="sec-role-card">
                  <div className="sec-role-head">
                    <div>
                      <strong>{role.label || role.name}</strong>
                      <span className="sec-role-name">{role.name}</span>
                      {role.description && <p className="sec-role-desc">{role.description}</p>}
                    </div>
                    <div className="sec-role-meta">
                      <span className="sec-badge">{(role.permissions || []).length} permissions</span>
                      {typeof role.user_count === 'number' && (
                        <span className="sec-badge sec-badge--muted">{role.user_count} utilisateur(s)</span>
                      )}
                      {canManage && role.name !== 'super_admin' && editing !== role.id && (
                        <button className="sec-btn" onClick={() => startEdit(role)}>Modifier</button>
                      )}
                    </div>
                  </div>

                  {editing === role.id ? (
                    <div className="sec-perm-editor">
                      {Object.entries(grouped).map(([cat, perms]) => (
                        <div key={cat} className="sec-perm-group">
                          <h4>{cat}</h4>
                          <div className="sec-perm-list">
                            {perms.map((p) => (
                              <label key={p.name} className="sec-perm-item">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(p.name)}
                                  onChange={() => toggle(p.name)}
                                />
                                <span title={p.name}>{p.label || p.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="sec-actions">
                        <button className="sec-btn sec-btn--primary" disabled={busy} onClick={() => save(role)}>
                          {busy ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                        <button className="sec-btn" onClick={() => setEditing(null)}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className="sec-perm-chips">
                      {role.name === 'super_admin'
                        ? <span className="sec-chip sec-chip--all">Toutes les permissions</span>
                        : (role.permissions || []).map((p) => <span key={p} className="sec-chip">{p}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default RolesPage;
