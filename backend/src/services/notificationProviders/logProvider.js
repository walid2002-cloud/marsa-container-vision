/**
 * Provider de simulation : n'envoie rien réellement, mais journalise clairement
 * et renvoie un statut "sent" marqué comme simulé.
 */
function maskRecipient(recipient) {
  if (!recipient) return 'inconnu';
  const s = String(recipient);
  if (s.includes('@')) {
    const [user, domain] = s.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return s.length > 5 ? `${s.slice(0, 5)}***${s.slice(-2)}` : s;
}

async function send({ channel, recipient, subject, message }) {
  const preview = String(message || '').replace(/\s+/g, ' ').slice(0, 140);
  console.log(
    `[NOTIFICATION SIMULÉE] Canal: ${channel} | Destinataire: ${maskRecipient(recipient)}` +
    `${subject ? ` | Sujet: ${subject}` : ''} | Message: ${preview}`
  );
  return { status: 'sent', provider: 'simulation', simulated: true, error: null };
}

module.exports = { send, maskRecipient };
