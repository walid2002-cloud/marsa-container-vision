/**
 * Provider WhatsApp (Meta Cloud API).
 * En l'absence de configuration complète ou en mode simulation, délègue au logProvider.
 */
const axios = require('axios');
const logProvider = require('./logProvider');

function isConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function send({ channel, recipient, subject, message, simulationMode }) {
  const provider = process.env.WHATSAPP_PROVIDER || 'simulation';
  if (simulationMode || provider === 'simulation' || !isConfigured()) {
    return logProvider.send({ channel, recipient, subject, message });
  }

  try {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: message },
      },
      {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
        timeout: 15000,
      }
    );
    return { status: 'sent', provider: 'cloud_api', simulated: false, error: null };
  } catch (e) {
    const detail = e.response?.data?.error?.message || e.message;
    return { status: 'failed', provider: 'cloud_api', simulated: false, error: detail };
  }
}

module.exports = { send, isConfigured };
