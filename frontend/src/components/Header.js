import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import UserMenu from './UserMenu';
import MarsaAiLink from './MarsaAiLink';
import { getSettings } from '../services/api';
import './Header.css';

function navItemClass({ isActive }) {
  return ['header-nav-item', isActive ? 'header-nav-item--active' : null].filter(Boolean).join(' ');
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', permission: null },
  { to: '/search', label: 'Recherche', permission: 'containers.search' },
  { to: '/live-cameras', label: 'Live Cameras', permission: 'cameras.read' },
  { to: '/terminal-map', label: 'Carte terminal', permission: 'terminal_map.read' },
  { to: '/alerts', label: 'Alertes', permission: 'alerts.read' },
  { to: '/notifications', label: 'Notifications', permission: 'notifications.read' },
  { to: '/vision-upload', label: 'Analyse image', permission: 'uploads.create' },
  { to: '/audit', label: "Journal d'audit", permission: 'audit.read' },
  { to: '/users', label: 'Utilisateurs', permission: 'users.read' },
  { to: '/roles', label: 'Rôles', permission: 'roles.manage' },
  { to: '/security', label: 'Sécurité', permission: null },
];

function Header() {
  const { admin, hasPermission } = useAuth();
  const [marsaAiUrl, setMarsaAiUrl] = useState('');

  useEffect(() => {
    if (!admin) return;
    getSettings()
      .then((r) => {
        if (r.success && r.data) {
          setMarsaAiUrl(r.data.marsa_ai_url || process.env.REACT_APP_MARSA_AI_URL || '');
        }
      })
      .catch(() => {});
  }, [admin]);

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-top">
          <div className="header-brand">
            <img
              className="header-brand-logo"
              src={`${process.env.PUBLIC_URL}/marsa-maroc-logo.png`}
              alt="Marsa Maroc"
              width={96}
              height={40}
              decoding="async"
            />
            <div className="header-brand-text">
              <h1 className="header-title">Marsa Container Vision</h1>
              <p className="header-subtitle">
                Recherche et analyse intelligente des conteneurs
              </p>
            </div>
          </div>

          {admin && (
            <div className="header-user-bar">
              <MarsaAiLink url={marsaAiUrl} />
              <ThemeToggle />
              <UserMenu />
            </div>
          )}
        </div>

        {admin && (
          <nav className="header-nav" aria-label="Navigation principale">
            {visibleNav.map((item) => (
              <NavLink key={item.to} to={item.to} className={navItemClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}

export default Header;
