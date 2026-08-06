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
  const verifyUrl = `${APP_URL}/auth/verify-email?token=${verifyToken}`;

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

module.exports = { sendWelcomeEmail, sendPasswordResetEmail };
