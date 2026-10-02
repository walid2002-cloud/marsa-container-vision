import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import './ThemeToggle.css';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className={`theme-toggle-icon theme-toggle-icon--sun ${!isDark ? 'is-active' : ''}`}>
          &#9728;
        </span>
        <span className={`theme-toggle-icon theme-toggle-icon--moon ${isDark ? 'is-active' : ''}`}>
          &#127769;
        </span>
        <span className={`theme-toggle-thumb ${isDark ? 'is-dark' : ''}`} />
      </span>
    </button>
  );
}

export default ThemeToggle;
