import React, { useState } from 'react';
import './SearchBar.css';

const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/;
const NUMERIC_REGEX = /^\d{3,7}$/;

function validateCode(raw) {
  if (!raw || raw.trim() === '') {
    return { valid: false, error: 'Veuillez saisir un identifiant conteneur.' };
  }

  const normalized = raw.trim().replace(/[\s\-\.]+/g, '').toUpperCase();

  if (normalized.length < 3) {
    return { valid: false, error: 'L\'identifiant est trop court (minimum 3 caractères).' };
  }

  if (normalized.length > 15) {
    return { valid: false, error: 'L\'identifiant est trop long (maximum 15 caractères).' };
  }

  if (ISO_6346_REGEX.test(normalized) || NUMERIC_REGEX.test(normalized)) {
    return { valid: true, normalized, error: null };
  }

  if (/^[A-Z0-9]+$/.test(normalized)) {
    return { valid: true, normalized, error: null };
  }

  return { valid: false, error: 'Format invalide. Exemples : 79943, MSCU1234567' };
}

function SearchBar({ onSearch, loading }) {
  const [code, setCode] = useState('');
  const [validationError, setValidationError] = useState(null);

  const handleChange = (e) => {
    setCode(e.target.value);
    if (validationError) setValidationError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;

    const { valid, normalized, error } = validateCode(code);

    if (!valid) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    onSearch(normalized);
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-input-group">
        <div className="search-input-wrapper">
          <span className="search-icon">&#128269;</span>
          <input
            type="text"
            className={`search-input ${validationError ? 'search-input-error' : ''}`}
            placeholder="Ex : 79943 ou MSCU7894563"
            value={code}
            onChange={handleChange}
            disabled={loading}
            autoFocus
            autoComplete="off"
            aria-label="Code conteneur"
          />
        </div>
        {validationError && (
          <div className="search-validation-error">
            <span>&#9888;</span> {validationError}
          </div>
        )}
      </div>
      <button
        type="submit"
        className={`search-button ${loading ? 'search-button-loading' : ''}`}
        disabled={loading || !code.trim()}
      >
        {loading ? (
          <>
            <span className="search-spinner" />
            <span className="search-button-text">Analyse des caméras actives en cours…</span>
          </>
        ) : (
          'Rechercher dans les caméras'
        )}
      </button>
    </form>
  );
}

export default SearchBar;
