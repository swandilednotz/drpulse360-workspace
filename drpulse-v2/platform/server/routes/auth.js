const router    = require('express').Router();
const https     = require('https');

// Use https.request instead of fetch for OAuth token exchanges
// Native fetch on Windows/Node can hang on POST with body
function httpsPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode < 400, json: () => JSON.parse(data), status: res.statusCode });
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Token exchange timed out')); });
    req.write(body);
    req.end();
  });
}
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const { OAuth2Client }  = require('google-auth-library');
const msal              = require('@azure/msal-node');

const { platform, audit } = require('../db');
const {
  signMasterToken, signScopedToken,
  signTempToken, signVerifyToken,
  verifyTempToken, verifyToken,
  requirePlatformAuth,
} = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../mailer');

const APP_NAME = process.env.APP_NAME || 'DR Pulse 360';

// ── Helpers ───────────────────────────────────────────────────────────────

// Fetch all client_app IDs the user is assigned to
async function getUserClientApps(userId) {
  const { rows } = await platform.query(
    `SELECT client_app_id FROM user_client_app_roles WHERE user_id = $1`,
    [userId]
  );
  return rows.map(r => r.client_app_id);
}

// Build and sign master JWT
async function issueMasterJWT(user) {
  const clientAppIds = await getUserClientApps(user.id);

  // Get highest role across all client_apps for platform_role claim
  const { rows: roleRows } = await platform.query(
    `SELECT role_name FROM user_client_app_roles
     WHERE user_id = $1
     ORDER BY CASE role_name
       WHEN 'superuser' THEN 1
       WHEN 'admin'     THEN 2
       WHEN 'viewer'    THEN 3
       ELSE 4 END
     LIMIT 1`,
    [user.id]
  );
  const platformRole = roleRows[0]?.role_name ?? 'viewer';

  const { rows: tenantRows } = await platform.query(
    `SELECT name FROM tenants WHERE id = $1`, [user.tenant_id]
  );
  const tenantName = tenantRows[0]?.name ?? '';

  const token = signMasterToken(
    { ...user, platform_role: platformRole, tenant_name: tenantName },
    clientAppIds
  );

  // Record session
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await platform.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [user.id, hash]
  );

  // Update last_login_at
  await platform.query(
    `UPDATE platform_users SET last_login_at = NOW() WHERE id = $1`, [user.id]
  );

  return { token, clientAppIds, tenantName };
}

// Public-safe user object
function publicUser(user, clientAppIds, tenantName) {
  return {
    id:           user.id,
    email:        user.email,
    name:         user.name,
    tenant_id:    user.tenant_id,
    tenant_name:  tenantName,
    auth_provider: user.auth_provider,
    totp_enabled: user.totp_enabled,
    client_apps:  clientAppIds,
  };
}


// ══════════════════════════════════════════════════════════════════════════
// PATH 1 — EMAIL + PASSWORD + TOTP
// ══════════════════════════════════════════════════════════════════════════

// POST /auth/login
// Step 1: validate password → return tempToken
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    const { rows } = await platform.query(
      `SELECT * FROM platform_users
        WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
      [email.trim()]
    );

    if (!rows.length)
      return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];

    // Reject OAuth-only accounts trying to use password
    if (user.auth_provider === 'google' || user.auth_provider === 'microsoft')
      return res.status(401).json({
        error: `This account uses ${user.auth_provider === 'google' ? 'Google' : 'Microsoft'} to sign in. Please use the Sign in button.`,
      });

    if (!user.password_hash)
      return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: 'Invalid email or password' });

    if (!user.email_verified)
      return res.status(403).json({ error: 'Please verify your email before logging in.' });

    const tempToken = signTempToken(user.id);

    // Must change password (first login with temp password)
    if (user.must_change_password)
      return res.json({ requires_password_change: true, tempToken });

    // 2FA not set up yet (first login)
    if (!user.totp_enabled)
      return res.json({ requires_2fa_setup: true, tempToken });

    // Normal login — needs TOTP
    return res.json({ requires_2fa: true, tempToken });

  } catch (e) {
    console.error('[auth/login]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// POST /auth/change-password  (first login forced change)
router.post('/change-password', async (req, res) => {
  const { tempToken, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const payload = verifyTempToken(tempToken);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });

  try {
    const hash = await bcrypt.hash(newPassword, 12);
    await platform.query(
      `UPDATE platform_users
          SET password_hash = $1, must_change_password = FALSE
        WHERE id = $2`,
      [hash, payload.sub]
    );

    // Fetch updated user
    const { rows } = await platform.query(
      `SELECT * FROM platform_users WHERE id = $1`, [payload.sub]
    );
    const user = rows[0];

    // Issue a new tempToken for 2FA setup
    const newTempToken = signTempToken(user.id);
    res.json({ requires_2fa_setup: true, tempToken: newTempToken });
  } catch (e) {
    console.error('[auth/change-password]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// POST /auth/2fa/setup  — generate TOTP secret + QR code
router.post('/2fa/setup', async (req, res) => {
  const payload = verifyTempToken(req.body.tempToken);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });

  try {
    const { rows } = await platform.query(
      `SELECT id, email FROM platform_users WHERE id = $1`, [payload.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const secret = speakeasy.generateSecret({
      name:   `${APP_NAME} (${rows[0].email})`,
      length: 20,
    });

    await platform.query(
      `UPDATE platform_users SET totp_secret = $1 WHERE id = $2`,
      [secret.base32, payload.sub]
    );

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ qrDataUrl, secret: secret.base32 });
  } catch (e) {
    console.error('[auth/2fa/setup]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// POST /auth/2fa/verify-setup  — confirm first TOTP code, enable 2FA, issue master JWT
router.post('/2fa/verify-setup', async (req, res) => {
  const { tempToken, code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  const payload = verifyTempToken(tempToken);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });

  try {
    const { rows } = await platform.query(
      `SELECT * FROM platform_users WHERE id = $1`, [payload.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user  = rows[0];
    const valid = speakeasy.totp.verify({
      secret: user.totp_secret, encoding: 'base32',
      token: code.replace(/\s/g, ''), window: 1,
    });
    if (!valid) return res.status(401).json({ error: 'Incorrect code. Try again.' });

    // Generate 8 single-use backup codes
    const plainCodes  = Array.from({ length: 8 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{4})/g, '$1-').slice(0, -1)
    );
    const hashedCodes = await Promise.all(plainCodes.map(c => bcrypt.hash(c, 10)));

    await platform.query(
      `UPDATE platform_users SET totp_enabled = TRUE, backup_codes = $1 WHERE id = $2`,
      [hashedCodes, user.id]
    );

    const { token, clientAppIds, tenantName } = await issueMasterJWT(user);
    await audit(user.tenant_id, user.id, null, '2fa_enabled');

    res.json({ token, backupCodes: plainCodes, user: publicUser(user, clientAppIds, tenantName) });
  } catch (e) {
    console.error('[auth/2fa/verify-setup]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// POST /auth/2fa/verify  — verify TOTP on subsequent logins
router.post('/2fa/verify', async (req, res) => {
  const { tempToken, code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  const payload = verifyTempToken(tempToken);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });

  try {
    const { rows } = await platform.query(
      `SELECT * FROM platform_users WHERE id = $1`, [payload.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    if (!user.totp_enabled || !user.totp_secret)
      return res.status(400).json({ error: '2FA is not configured for this account' });

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret, encoding: 'base32',
      token: code.replace(/\s/g, ''), window: 1,
    });
    if (!valid) return res.status(401).json({ error: 'Incorrect code. Try again.' });

    const { token, clientAppIds, tenantName } = await issueMasterJWT(user);
    await audit(user.tenant_id, user.id, null, 'login', { method: 'totp' });

    res.json({ token, user: publicUser(user, clientAppIds, tenantName) });
  } catch (e) {
    console.error('[auth/2fa/verify]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// POST /auth/2fa/verify-backup  — use a backup code instead of TOTP
router.post('/2fa/verify-backup', async (req, res) => {
  const { tempToken, backupCode } = req.body;
  if (!backupCode) return res.status(400).json({ error: 'Backup code is required' });

  const payload = verifyTempToken(tempToken);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });

  try {
    const { rows } = await platform.query(
      `SELECT * FROM platform_users WHERE id = $1`, [payload.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user  = rows[0];
    const codes = user.backup_codes || [];
    if (!codes.length)
      return res.status(401).json({ error: 'No backup codes available. Contact your administrator.' });

    let matchIndex = -1;
    for (let i = 0; i < codes.length; i++) {
      if (await bcrypt.compare(backupCode.toUpperCase().trim(), codes[i])) {
        matchIndex = i; break;
      }
    }
    if (matchIndex === -1) return res.status(401).json({ error: 'Invalid backup code.' });

    const remaining = codes.filter((_, i) => i !== matchIndex);
    await platform.query(
      `UPDATE platform_users SET backup_codes = $1 WHERE id = $2`, [remaining, user.id]
    );

    const { token, clientAppIds, tenantName } = await issueMasterJWT(user);
    await audit(user.tenant_id, user.id, null, 'login', { method: 'backup_code', codes_remaining: remaining.length });

    res.json({ token, codesRemaining: remaining.length, user: publicUser(user, clientAppIds, tenantName) });
  } catch (e) {
    console.error('[auth/2fa/verify-backup]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ══════════════════════════════════════════════════════════════════════════
// PATH 2 — GOOGLE OAUTH
// ══════════════════════════════════════════════════════════════════════════

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// GET /auth/google  — redirect to Google
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID)
    return res.status(503).json({ error: 'Google login not configured' });

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile',
    state:         crypto.randomBytes(16).toString('hex'),
    access_type:   'online',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /auth/google/callback  — Google redirects here
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  console.log('[google/callback] received code:', !!code, 'error:', error);

  if (error)
    return res.redirect(`${process.env.APP_BASE_URL}/login?error=google_denied`);

  try {
    // Exchange code for tokens
    console.log('[google/callback] exchanging code...');
    const googleBody = new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
      grant_type:    'authorization_code',
    }).toString();
    console.log('[google/callback] calling token endpoint...');
    const tokenRes = await httpsPost('https://oauth2.googleapis.com/token', googleBody);
    console.log('[google/callback] token endpoint status:', tokenRes.status);
    const tokenData = await tokenRes.json();
    if (!tokenData.id_token) throw new Error('No id_token from Google');

    // Verify the id_token
    const ticket  = await googleClient.verifyIdToken({ idToken: tokenData.id_token });
    const gPayload = ticket.getPayload();
    const googleId = gPayload.sub;
    const email    = gPayload.email;
    const name     = gPayload.name;

    // Look up by google_id first (returning user)
    let { rows } = await platform.query(
      `SELECT * FROM platform_users WHERE google_id = $1 AND is_active = TRUE`,
      [googleId]
    );

    if (!rows.length) {
      // Search by email — auto-link if found
      ({ rows } = await platform.query(
        `SELECT * FROM platform_users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
        [email]
      ));

      if (!rows.length) {
        // Email not registered — block
        return res.redirect(`${process.env.APP_BASE_URL}/login?error=not_registered`);
      }

      // Auto-link: save google_id, update auth_provider
      const existing = rows[0];
      const newProvider = ['local', 'microsoft'].includes(existing.auth_provider) ? 'both' : 'google';
      await platform.query(
        `UPDATE platform_users
            SET google_id = $1, auth_provider = $2, name = COALESCE(name, $3)
          WHERE id = $4`,
        [googleId, newProvider, name, existing.id]
      );
      rows[0] = { ...existing, google_id: googleId, auth_provider: newProvider };
      await audit(existing.tenant_id, existing.id, null, 'google_linked');
    }

    const user = rows[0];
    const { token, clientAppIds, tenantName } = await issueMasterJWT(user);
    await audit(user.tenant_id, user.id, null, 'login', { method: 'google' });

    res.redirect(`${process.env.APP_BASE_URL}/auth/complete?token=${token}`);
  } catch (e) {
    console.error('[auth/google/callback]', e.message);
    res.redirect(`${process.env.APP_BASE_URL}/login?error=google_failed`);
  }
});


// ══════════════════════════════════════════════════════════════════════════
// PATH 3 — MICROSOFT OAUTH
// ══════════════════════════════════════════════════════════════════════════

// GET /auth/microsoft  — redirect to Microsoft
router.get('/microsoft', (req, res) => {
  if (!process.env.MICROSOFT_CLIENT_ID)
    return res.status(503).json({ error: 'Microsoft login not configured' });

  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  const params   = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    redirect_uri:  process.env.MICROSOFT_REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile User.Read',
    state:         crypto.randomBytes(16).toString('hex'),
    response_mode: 'query',
  });
  res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`);
});

// GET /auth/microsoft/callback  — Microsoft redirects here
router.get('/microsoft/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error)
    return res.redirect(`${process.env.APP_BASE_URL}/login?error=microsoft_denied`);

  try {
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    // Exchange code for tokens
    const msBody = new URLSearchParams({
      code,
      client_id:     process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      redirect_uri:  process.env.MICROSOFT_REDIRECT_URI,
      grant_type:    'authorization_code',
      scope:         'openid email profile User.Read',
    }).toString();
    console.log('[microsoft/callback] calling token endpoint...');
    const tokenRes = await httpsPost(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      msBody
    );
    console.log('[microsoft/callback] token endpoint status:', tokenRes.status);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access_token from Microsoft');

    // Get user profile from Microsoft Graph
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile     = await profileRes.json();
    const microsoftId = profile.id;
    const email       = profile.mail || profile.userPrincipalName;
    const name        = profile.displayName;

    if (!email) throw new Error('Could not retrieve email from Microsoft');

    // Look up by microsoft_id first
    let { rows } = await platform.query(
      `SELECT * FROM platform_users WHERE microsoft_id = $1 AND is_active = TRUE`,
      [microsoftId]
    );

    if (!rows.length) {
      // Search by email — auto-link if found
      ({ rows } = await platform.query(
        `SELECT * FROM platform_users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
        [email]
      ));

      if (!rows.length)
        return res.redirect(`${process.env.APP_BASE_URL}/login?error=not_registered`);

      // Auto-link
      const existing    = rows[0];
      const newProvider = ['local', 'google'].includes(existing.auth_provider) ? 'both' : 'microsoft';
      await platform.query(
        `UPDATE platform_users
            SET microsoft_id = $1, auth_provider = $2, name = COALESCE(name, $3)
          WHERE id = $4`,
        [microsoftId, newProvider, name, existing.id]
      );
      rows[0] = { ...existing, microsoft_id: microsoftId, auth_provider: newProvider };
      await audit(existing.tenant_id, existing.id, null, 'microsoft_linked');
    }

    const user = rows[0];
    const { token, clientAppIds, tenantName } = await issueMasterJWT(user);
    await audit(user.tenant_id, user.id, null, 'login', { method: 'microsoft' });

    res.redirect(`${process.env.APP_BASE_URL}/auth/complete?token=${token}`);
  } catch (e) {
    console.error('[auth/microsoft/callback]', e.message);
    res.redirect(`${process.env.APP_BASE_URL}/login?error=microsoft_failed`);
  }
});


// ══════════════════════════════════════════════════════════════════════════
// TOKEN EXCHANGE  — master JWT → scoped app token
// ══════════════════════════════════════════════════════════════════════════

// POST /auth/token-exchange
// Called when user clicks a product tile in the launcher.
router.post('/token-exchange', requirePlatformAuth, async (req, res) => {
  const { client_app_id } = req.body;
  if (!client_app_id)
    return res.status(400).json({ error: 'client_app_id is required' });

  // Verify the user is actually assigned to this client_app
  if (!req.user.client_apps?.includes(client_app_id))
    return res.status(403).json({ error: 'Access denied to this product' });

  try {
    // Get client_app details
    const { rows: caRows } = await platform.query(
      `SELECT ca.id, ca.is_active, a.slug AS app_slug, a.db_name
         FROM client_apps ca JOIN apps a ON a.id = ca.app_id
        WHERE ca.id = $1`,
      [client_app_id]
    );
    if (!caRows.length || !caRows[0].is_active)
      return res.status(403).json({ error: 'Product not found or inactive' });

    const ca = caRows[0];

    // Get user's role in this client_app (plus any per-user permission override)
    const { rows: roleRows } = await platform.query(
      `SELECT role_name, permissions_override FROM user_client_app_roles
        WHERE user_id = $1 AND client_app_id = $2`,
      [req.user.sub, client_app_id]
    );
    if (!roleRows.length)
      return res.status(403).json({ error: 'No role assigned in this product' });

    const role = roleRows[0].role_name;

    // Get page permissions for this role
    const { rows: permRows } = await platform.query(
      `SELECT page_key, level FROM role_permissions
        WHERE client_app_id = $1 AND role_name = $2`,
      [client_app_id, role]
    );
    const permissions = {};
    permRows.forEach(r => { permissions[r.page_key] = r.level; });

    // Per-user overrides (set at creation time, or via an approved access
    // request) win over the role's defaults on a page-by-page basis.
    if (roleRows[0].permissions_override) {
      Object.assign(permissions, roleRows[0].permissions_override);
    }

    const scopedToken = signScopedToken(
      { id: req.user.sub, tenant_id: req.user.tenant_id, email: req.user.email, name: req.user.name,
        master_token_hash: crypto.createHash('sha256')
          .update(req.headers.authorization?.replace(/^Bearer\s+/i,'') || '')
          .digest('hex').slice(0,16) },
      client_app_id, ca.app_slug, role, permissions
    );

    await audit(req.user.tenant_id, req.user.sub, client_app_id, 'app_entered', { app: ca.app_slug });

    res.json({
      token:         scopedToken,
      client_app_id,
      app:           ca.app_slug,
      role,
      permissions,
    });
  } catch (e) {
    console.error('[auth/token-exchange]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ══════════════════════════════════════════════════════════════════════════
// FORGOT / RESET PASSWORD
// ══════════════════════════════════════════════════════════════════════════

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const GENERIC   = { message: `If that email is registered you will receive a reset link.` };
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const { rows } = await platform.query(
      `SELECT id, email, auth_provider FROM platform_users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
      [email.trim()]
    );
    if (!rows.length) return res.json(GENERIC);
    if (rows[0].auth_provider !== 'local' && rows[0].auth_provider !== 'both')
      return res.json(GENERIC);

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await platform.query(
      `UPDATE platform_users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`,
      [token, expires, rows[0].id]
    );
    await sendPasswordResetEmail({ to: rows[0].email, token });
    res.json(GENERIC);
  } catch (e) {
    console.error('[auth/forgot-password]', e.message);
    res.json(GENERIC);
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const { rows } = await platform.query(
      `SELECT id FROM platform_users WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const hash = await bcrypt.hash(password, 12);
    await platform.query(
      `UPDATE platform_users
          SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL,
              must_change_password = FALSE
        WHERE id = $2`,
      [hash, rows[0].id]
    );
    res.json({ message: 'Password reset successfully.' });
  } catch (e) {
    console.error('[auth/reset-password]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ══════════════════════════════════════════════════════════════════════════
// EMAIL VERIFICATION
// ══════════════════════════════════════════════════════════════════════════

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const { rows } = await platform.query(
      `SELECT id FROM platform_users
        WHERE verify_token = $1 AND verify_token_expires > NOW() AND email_verified = FALSE`,
      [token]
    );
    if (!rows.length)
      return res.redirect(`${process.env.APP_BASE_URL}/login?error=verify_expired`);

    await platform.query(
      `UPDATE platform_users
          SET email_verified = TRUE, verify_token = NULL, verify_token_expires = NULL
        WHERE id = $1`,
      [rows[0].id]
    );
    res.redirect(`${process.env.APP_BASE_URL}/login?verified=1`);
  } catch (e) {
    console.error('[auth/verify-email]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ══════════════════════════════════════════════════════════════════════════
// PROFILE (any logged-in user)
// ══════════════════════════════════════════════════════════════════════════

router.patch('/profile/name', requirePlatformAuth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    await platform.query(
      `UPDATE platform_users SET name = $1 WHERE id = $2`, [name.trim(), req.user.sub]
    );
    res.json({ message: 'Name updated' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.patch('/profile/password', requirePlatformAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'Min 8 characters' });

  try {
    const { rows } = await platform.query(
      `SELECT password_hash, auth_provider FROM platform_users WHERE id = $1`, [req.user.sub]
    );
    if (!rows[0].password_hash)
      return res.status(400).json({ error: 'This account does not use a password' });
    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await platform.query(
      `UPDATE platform_users SET password_hash = $1 WHERE id = $2`, [hash, req.user.sub]
    );
    res.json({ message: 'Password changed' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/2fa/disable', requirePlatformAuth, async (req, res) => {
  const { password, code } = req.body;
  if (!password || !code)
    return res.status(400).json({ error: 'Password and TOTP code required' });
  try {
    const { rows } = await platform.query(
      `SELECT password_hash, totp_secret, totp_enabled FROM platform_users WHERE id = $1`,
      [req.user.sub]
    );
    const pwOk = rows[0].password_hash
      ? await bcrypt.compare(password, rows[0].password_hash)
      : false;
    if (!pwOk) return res.status(401).json({ error: 'Incorrect password' });
    if (!rows[0].totp_enabled) return res.status(400).json({ error: '2FA not enabled' });
    const valid = speakeasy.totp.verify({
      secret: rows[0].totp_secret, encoding: 'base32',
      token: code.replace(/\s/g, ''), window: 1,
    });
    if (!valid) return res.status(401).json({ error: 'Incorrect TOTP code' });
    await platform.query(
      `UPDATE platform_users SET totp_enabled = FALSE, totp_secret = NULL, backup_codes = NULL WHERE id = $1`,
      [req.user.sub]
    );
    res.json({ message: '2FA disabled' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /auth/refresh-scoped

router.post('/refresh-scoped', async (req, res) => {
  const { scoped_token } = req.body;
  if (!scoped_token) return res.status(400).json({ error: 'scoped_token required' });

  try {
    // Verify the scoped token
    let scopedPayload;
    try {
      scopedPayload = jwt.verify(scoped_token, PUBLIC_KEY, { algorithms: ['RS256'] });
    } catch {
      return res.status(401).json({ error: 'Invalid scoped token', redirect: true });
    }

    // Check the master session is still active (not revoked, not expired)
    const masterHash = scopedPayload.master_token_hash;
    if (masterHash) {
      const { rows: sessionRows } = await platform.query(
        `SELECT id FROM sessions
          WHERE token_hash LIKE $1
            AND revoked_at IS NULL
            AND expires_at > NOW()`,
        [masterHash + '%']
      );
      if (!sessionRows.length) {
        return res.status(401).json({
          error:    'Session expired or logged out',
          redirect: true,
        });
      }
    }

    // Reissue a fresh scoped token with the same claims
    const { rows: permRows } = await platform.query(
      `SELECT page_key, level FROM role_permissions
        WHERE client_app_id = $1 AND role_name = $2`,
      [scopedPayload.client_app_id, scopedPayload.role]
    );
    const permissions = {};
    permRows.forEach(r => { permissions[r.page_key] = r.level; });

    // Preserve any per-user override so it survives refresh, not just the
    // initial token exchange.
    const { rows: overrideRows } = await platform.query(
      `SELECT permissions_override FROM user_client_app_roles
        WHERE user_id = $1 AND client_app_id = $2`,
      [scopedPayload.sub, scopedPayload.client_app_id]
    );
    if (overrideRows.length && overrideRows[0].permissions_override) {
      Object.assign(permissions, overrideRows[0].permissions_override);
    }

    const newToken = signScopedToken(
      { id: scopedPayload.sub, tenant_id: scopedPayload.tenant_id,
        email: scopedPayload.email, master_token_hash: masterHash },
      scopedPayload.client_app_id, scopedPayload.app,
      scopedPayload.role, permissions
    );

    res.json({ token: newToken });
  } catch (e) {
    console.error('[auth/refresh-scoped]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/logout
router.post('/logout', requirePlatformAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await platform.query(
        `UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1`, [hash]
      );
    }
    // Also revoke ALL sessions for this user — logs out of all devices
    await platform.query(
      `UPDATE sessions SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.user.sub]
    );
    res.json({ message: 'Logged out' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.issueMasterJWT = issueMasterJWT;
module.exports = router;