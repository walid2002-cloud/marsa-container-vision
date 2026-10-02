import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import { useAuth } from '../contexts/AuthContext';
import { getSessions } from '../services/api';
import { formatRoleLabel } from '../utils/roleLabels';
import './SecurityPages.css';

function ProfilePage() {
  const { admin, refreshProfile } = useAuth();
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    refreshProfile();
    getSessions().then((r) => { if (r.success) setSessions(r.data || []); }).catch(() => {});
  }, [refreshProfile]);

  if (!admin) return null;

  const activeSessions = sessions.filter((s) => s.active).length;
  const roleLabel = formatRoleLabel(admin.roles || admin.role, admin.role_label);

  return (
    <>
      <Header />
      <main className="main-content mcv-page">
        <section className="mcv-section-card">
          <h2 className="section-title">Mon profil</h2>
          <dl className="sec-dl">
            <dt>Nom complet</dt><dd>{admin.full_name}</dd>
            <dt>Email</dt><dd>{admin.email}</dd>
            <dt>Rôle</dt><dd>{roleLabel}</dd>
            <dt>Dernière connexion</dt>
            <dd>{admin.last_login_at ? new Date(admin.last_login_at).toLocaleString('fr-FR') : '—'}</dd>
            <dt>MFA</dt><dd>{admin.mfa_enabled ? 'Activé' : 'Non activé'}</dd>
            <dt>Dernier changement mot de passe</dt>
            <dd>{admin.password_changed_at ? new Date(admin.password_changed_at).toLocaleString('fr-FR') : '—'}</dd>
            <dt>Expiration mot de passe</dt>
            <dd>
              {admin.password_expires_at ? new Date(admin.password_expires_at).toLocaleDateString('fr-FR') : '—'}
              {admin.password_expiring_soon && !admin.password_expired && (
                <span className="sec-warn"> — expire bientôt</span>
              )}
            </dd>
            <dt>Sessions actives</dt><dd>{activeSessions}</dd>
          </dl>
          <div className="sec-actions">
            <Link to="/change-password" className="sec-btn">Changer mot de passe</Link>
            <Link to="/security" className="sec-btn sec-btn--ghost">Sécurité / MFA</Link>
            <Link to="/sessions" className="sec-btn sec-btn--ghost">Gérer les sessions</Link>
          </div>
        </section>
      </main>
    </>
  );
}

export default ProfilePage;
