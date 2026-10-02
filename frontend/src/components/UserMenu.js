import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { formatRoleLabel } from '../utils/roleLabels';
import './UserMenu.css';

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

function UserMenu() {
  const { admin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!admin) return null;

  const roleLabel = formatRoleLabel(admin.roles || admin.role, admin.role_label);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="user-menu-avatar" aria-hidden="true">{initials(admin.full_name)}</span>
        <span className="user-menu-info">
          <span className="user-menu-name">{admin.full_name}</span>
          <span className="user-menu-role">{roleLabel}</span>
        </span>
        <span className="user-menu-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="user-menu-dropdown" role="menu">
          {admin.password_expiring_soon && !admin.password_expired && (
            <div className="user-menu-warn" role="alert">
              Mot de passe expire dans {admin.password_days_remaining} jour(s)
            </div>
          )}
          <Link to="/profile" className="user-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            Mon profil
          </Link>
          <Link to="/security" className="user-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            Sécurité
          </Link>
          <Link to="/change-password" className="user-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            Changer mot de passe
          </Link>
          <hr className="user-menu-divider" />
          <button type="button" className="user-menu-item user-menu-item--danger" role="menuitem" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
