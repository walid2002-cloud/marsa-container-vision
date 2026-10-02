/**
 * Provider SMS. Aucune intégration réelle par défaut : simulation via logProvider.
 * (Prévu pour brancher Twilio / autre plus tard.)
 */
const logProvider = require('./logProvider');

function isConfigured() {
  return false; // Aucun fournisseur SMS réel configuré par défaut.
}

async function send({ channel, recipient, subject, message }) {
  // Toujours simulé pour l'instant.
  return logProvider.send({ channel, recipient, subject, message });
}

module.exports = { send, isConfigured };
