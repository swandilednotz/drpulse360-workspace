
const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM    = process.env.SMTP_FROM    || '"DR Pulse 360" <no-reply@drpulse360.com>';
const APP_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

// ── Welcome + email verification ─────────────────────────────────────────
async function sendWelcomeEmail({ to, name, verifyToken, tempPassword, auth_provider }) {
  // /api/auth/verify-email is a BACKEND route (see routes/auth.js), not a
  // React page — Vite's dev proxy (and, in production, the reverse proxy)
  // forwards /api/* from this same origin to the platform API. Without the
  // /api prefix here, the link 404s against the frontend router instead.
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${verifyToken}`;

  let body = `Hi ${name || 'there'},\n\nYou have been added to DR Pulse 360.\n\n`;

  if (auth_provider === 'local' || auth_provider === 'both') {
    body += `Your temporary password is: ${tempPassword}\n`;
    body += `You will be asked to change it on first login.\n\n`;
  }

  if (auth_provider === 'google') {
    body += `You can sign in using your Google account (${to}).\n\n`;
  }
  if (auth_provider === 'microsoft') {
    body += `You can sign in using your Microsoft account (${to}).\n\n`;
  }
  if (auth_provider === 'both') {
    body += `You can also sign in with Google or Microsoft using this email.\n\n`;
  }

  body += `First, please verify your email address:\n${verifyUrl}\n\n`;
  body += `Then log in at: ${APP_URL}\n\nThe DR Pulse 360 team`;

  return transport.sendMail({
    from: FROM,
    to,
    subject: 'You have been added to DR Pulse 360',
    text: body,
  });
}

// ── Password reset ────────────────────────────────────────────────────────
async function sendPasswordResetEmail({ to, token }) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  return transport.sendMail({
    from: FROM,
    to,
    subject: 'Reset your DR Pulse 360 password',
    text: `Click the link below to reset your password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
  });
}

// ── Existing user granted access to another app ───────────────────────────
// No password to send (they already have working credentials), so this
// is a much lighter notice than sendWelcomeEmail.
async function sendAccessGrantedEmail({ to, name, appName }) {
  const body = `Hi ${name || 'there'},\n\n` +
    `You've been given access to ${appName} on DR Pulse 360.\n\n` +
    `Log in with your existing DR Pulse 360 credentials at: ${APP_URL}\n\n` +
    `The DR Pulse 360 team`;

  return transport.sendMail({
    from: FROM,
    to,
    subject: `You now have access to ${appName} on DR Pulse 360`,
    text: body,
  });
}

// ── Access request approved ────────────────────────────────────────────────
async function sendAccessRequestApprovedEmail({ to, name, appName, permissions }) {
  const pageLines = Object.entries(permissions || {})
    .filter(([, level]) => level && level !== 'none')
    .map(([page, level]) => `  • ${page}: ${level}`)
    .join('\n');

  const body = `Hi ${name || 'there'},\n\n` +
    `Your request for access to ${appName} on DR Pulse 360 has been approved.\n\n` +
    (pageLines ? `You now have:\n${pageLines}\n\n` : '') +
    `Log in at ${APP_URL} — this takes effect the next time you sign in.\n\n` +
    `The DR Pulse 360 team`;

  return transport.sendMail({
    from: FROM,
    to,
    subject: `Your access request for ${appName} was approved`,
    text: body,
  });
}

// ── Access request denied ──────────────────────────────────────────────────
async function sendAccessRequestDeniedEmail({ to, name, appName }) {
  const body = `Hi ${name || 'there'},\n\n` +
    `Your request for access to ${appName} on DR Pulse 360 was not approved.\n\n` +
    `If you believe this was a mistake, reach out to your workspace administrator.\n\n` +
    `The DR Pulse 360 team`;

  return transport.sendMail({
    from: FROM,
    to,
    subject: `Your access request for ${appName} was declined`,
    text: body,
  });
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAccessGrantedEmail,
  sendAccessRequestApprovedEmail,
  sendAccessRequestDeniedEmail,
};