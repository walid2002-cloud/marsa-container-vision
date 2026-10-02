import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import PrototypeBanner from './PrototypeBanner';
import { useAuth } from '../contexts/AuthContext';
import {
  getUsers, createUser, updateUser, deactivateUser, setUserRoles, resetUserMfa, getRoles,
} from '../services/api';
import './SecurityPages.css';

const EMPTY_NEW = { full_name: '', email: '', password: '', roles: ['reader'] };

function UsersPage() {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [newUser, setNewUser] = useState(EMPTY_NEW);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const canCreate = hasPermission('users.create');
  const canUpdate = hasPermission('users.update');
  const canDelete = hasPermission('users.delete');
  const canManageRoles = hasPermission('roles.manage');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [uRes, rRes] = await Promise.all([getUsers(), getRoles()]);
      if (uRes.success) setUsers(uRes.data);
      if (rRes.success) setRoles(rRes.data);
    } catch (e) {
      setMessage(e.response?.data?.error || 'Impossible de charger les utilisateurs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 4000); };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await createUser(newUser);
      if (res.success) { flash('Utilisateur créé.'); setNewUser(EMPTY_NEW); await load(); }
      else flash(res.error || 'Échec de la création.');
    } catch (e2) {
      flash(e2.response?.data?.error || 'Échec de la création.');
    } finally { setCreating(false); }
  };

  const handleToggleActive = async (u) => {
    setBusyId(u.id);
    try {
      if (u.is_active) { await deactivateUser(u.id); }
      else { await updateUser(u.id, { is_active: true }); }
      await load();
    } catch (e) { flash(e.response?.data?.error || 'Action impossible.'); }
    finally { setBusyId(null); }
  };

  const handleRoleChange = async (u, roleName) => {
    setBusyId(u.id);
    try { await setUserRoles(u.id, [roleName]); flash('Rôle mis à jour.'); await load(); }
    catch (e) { flash(e.response?.data?.error || 'Action impossible.'); }
    finally { setBusyId(null); }
  };

  const handleResetMfa = async (u) => {
    setBusyId(u.id);
    try { await resetUserMfa(u.id); flash('MFA réinitialisé.'); await load(); }
    catch (e) { flash(e.response?.data?.error || 'Action impossible.'); }
    finally { setBusyId(null); }
  };

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <PrototypeBanner />
        <section className="mcv-section-card">
          <div className="mcv-section-header">
            <h2 className="section-title">
              <span className="mcv-section-icon" aria-hidden="true">&#128100;</span>
              Gestion des utilisateurs
            </h2>
          </div>

          {message && <div className="sec-message">{message}</div>}

          {canCreate && (
            <form className="sec-create-form" onSubmit={handleCreate}>
              <input
                type="text" placeholder="Nom complet" value={newUser.full_name} required
                onChange={(e) => setNewUser((s) => ({ ...s, full_name: e.target.value }))}
              />
              <input
                type="email" placeholder="Email" value={newUser.email} required
                onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
              />
              <input
                type="password" placeholder="Mot de passe" value={newUser.password} required
                onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
              />
              <select
                value={newUser.roles[0]}
                onChange={(e) => setNewUser((s) => ({ ...s, roles: [e.target.value] }))}
              >
                {roles.map((r) => <option key={r.name} value={r.name}>{r.label || r.name}</option>)}
              </select>
              <button type="submit" className="sec-btn sec-btn--primary" disabled={creating}>
                {creating ? 'Création…' : 'Créer'}
              </button>
            </form>
          )}

          {loading ? (
            <div className="sec-loading"><span className="spinner" /> Chargement…</div>
          ) : (
            <div className="sec-table-wrap">
              <table className="sec-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>MFA</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.is_active ? '' : 'sec-row-inactive'}>
                      <td>{u.id}</td>
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>
                        {canManageRoles ? (
                          <select
                            value={(u.roles && u.roles[0]) || u.role}
                            disabled={busyId === u.id}
                            onChange={(e) => handleRoleChange(u, e.target.value)}
                          >
                            {roles.map((r) => <option key={r.name} value={r.name}>{r.label || r.name}</option>)}
                          </select>
                        ) : (
                          <span className="sec-badge">{(u.roles && u.roles[0]) || u.role}</span>
                        )}
                      </td>
                      <td>
                        <span className={`sec-badge ${u.is_active ? 'sec-badge--ok' : 'sec-badge--off'}`}>
                          {u.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>
                        <span className={`sec-badge ${u.mfa_enabled ? 'sec-badge--ok' : 'sec-badge--muted'}`}>
                          {u.mfa_enabled ? 'Activé' : 'Désactivé'}
                        </span>
                      </td>
                      <td className="sec-actions">
                        {canUpdate && (
                          <button className="sec-btn" disabled={busyId === u.id} onClick={() => handleResetMfa(u)}>
                            Reset MFA
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className={`sec-btn ${u.is_active ? 'sec-btn--danger' : ''}`}
                            disabled={busyId === u.id}
                            onClick={() => handleToggleActive(u)}
                          >
                            {u.is_active ? 'Désactiver' : 'Réactiver'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default UsersPage;
