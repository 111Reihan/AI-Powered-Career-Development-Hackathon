// Outgoing email for verification and password reset.
// SMTP_URL (e.g. smtps://user:pass@smtp.example.com:465) + MAIL_FROM enable real delivery (needs the optional `nodemailer` package).
// Without SMTP_URL: on localhost the message is printed to the server console (dev only); in production email sign-up is switched off.
import { IS_PROD } from './config.js';

export const mailMode = () => (process.env.SMTP_URL ? 'smtp' : IS_PROD ? 'off' : 'console');
let tp;
export async function sendMail({ to, subject, text }) {
  const mode = mailMode();
  if (mode === 'console') { console.log(`[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n[mail:dev] ${text.replace(/\n/g, '\n[mail:dev] ')}`); return true; }
  if (mode === 'off') return false;
  try {
    if (!tp) { const { default: nm } = await import('nodemailer'); tp = nm.createTransport(process.env.SMTP_URL); }
    await tp.sendMail({ from: process.env.MAIL_FROM || 'Orbit <no-reply@localhost>', to, subject, text });
    return true;
  } catch (e) { console.error('mail failed:', e.message); return false; }
}
