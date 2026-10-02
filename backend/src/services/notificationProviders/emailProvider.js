/**
 * Provider Email (SMTP via nodemailer si disponible).
 * En l'absence de configuration SMTP ou en mode simulation, délègue au logProvider.
 * nodemailer est optionnel : s'il n'est pas installé, on simule proprement.
 */
const logProvider = require('./logProvider');

let nodemailer = null;
try {
  // eslint-disable-next-line global-require
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

async function send({ channel, recipient, subject, message, simulationMode }) {
  const provider = process.env.EMAIL_PROVIDER || 'simulation';
  if (simulationMode || provider === 'simulation' || !isConfigured() || !nodemailer) {
    return logProvider.send({ channel, recipient, subject, message });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Marsa Container Vision <no-reply@marsamaroc.local>',
      to: recipient,
      subject: subject || 'Alerte Marsa Container Vision',
      text: message,
    });
    return { status: 'sent', provider: 'smtp', simulated: false, error: null };
  } catch (e) {
    return { status: 'failed', provider: 'smtp', simulated: false, error: e.message };
  }
}

module.exports = { send, isConfigured };
