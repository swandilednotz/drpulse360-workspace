const jwt  = require('jsonwebtoken');
const fs   = require('fs');
const path = require('path');

// ── Load RSA key pair ─────────────────────────────────────────────────────
// Private key: platform only — signs all tokens
// Public key:  platform + every product app — verifies tokens
let PRIVATE_KEY = null;
let PUBLIC_KEY  = null;

const privPath = process.env.JWT_PRIVATE_KEY_PATH || path.join(__dirname, '../keys/private.pem');
const pubPath  = process.env.JWT_PUBLIC_KEY_PATH  || path.join(__dirname, '../keys/public.pem');

try {
  PRIVATE_KEY = fs.readFileSync(privPath, 'utf8');
  PUBLIC_KEY  = fs.readFileSync(pubPath,  'utf8');
  console.log('[auth] RSA keys loaded');
} catch (_) {
  console.warn('[auth] RSA keys not found — run: node scripts/generate-keys.js');
}

// ── TTLs ─────────────────────────────────────────────────────────────────
const MASTER_TTL = process.env.MASTER_TOKEN_TTL || '15m';
const SCOPED_TTL = process.env.SCOPED_TOKEN_TTL || '60m';
const TEMP_TTL   = '5m';

// ── Sign helpers ──────────────────────────────────────────────────────────

/**
 * Master JWT — issued after successful login (any method).
 * Contains identity + which client_apps the user can access.
 * Stored in localStorage on DR Pulse 360 only.
 * Product apps never see this token.
 */
function signMasterToken(user, clientAppIds) {
  if (!PRIVATE_KEY) throw new Error('RSA private key not loaded');
  return jwt.sign(
    {
      sub:          user.id,
      tenant_id:    user.tenant_id,
      tenant_name:   user.tenant_name ?? '',  
      email:        user.email,
      name:         user.name,
      platform_role: user.platform_role ?? 'viewer',
      client_apps:  clientAppIds,   // ["ca-sony-srt", "ca-sony-subtitle"]
      twofa_ok:     true,
      purpose:      'master',
    },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: MASTER_TTL }
  );
}

/**
 * Scoped token — issued by token exchange when user enters a product.
 * Contains workspace context + full page permissions.
 * Verified by product apps using PUBLIC_KEY only.
 */
function signScopedToken(user, clientAppId, appSlug, role, permissions) {
  if (!PRIVATE_KEY) throw new Error('RSA private key not loaded');
  return jwt.sign(
    {
      sub:           user.id,
      tenant_id:     user.tenant_id,
      email:         user.email,
      name:          user.name, 
      client_app_id: clientAppId,   // "ca-sony-srt"
      app:           appSlug,        // "srt-manager"
      role,
      permissions,   // { affiliates: "edit", devices: "view", ota: "none" }
      purpose:       'scoped',
    },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: SCOPED_TTL }
  );
}

/**
 * Temp token — issued after password validation, before 2FA.
 * Valid for 5 minutes, only accepted by /auth/2fa/* routes.
 */
function signTempToken(userId) {
  if (!PRIVATE_KEY) throw new Error('RSA private key not loaded');
  return jwt.sign(
    { sub: userId, purpose: '2fa-pending' },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: TEMP_TTL }
  );
}

/**
 * Email verification token — single-use, 24-hour TTL.
 */
function signVerifyToken(userId) {
  if (!PRIVATE_KEY) throw new Error('RSA private key not loaded');
  return jwt.sign(
    { sub: userId, purpose: 'email-verify' },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '24h' }
  );
}

// ── Verify helpers ────────────────────────────────────────────────────────

function verifyToken(token) {
  if (!PUBLIC_KEY) throw new Error('RSA public key not loaded');
  return jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
}

function verifyTempToken(token) {
  try {
    const p = verifyToken(token);
    return p.purpose === '2fa-pending' ? p : null;
  } catch { return null; }
}

// ── Express middleware ─────────────────────────────────────────────────────

/**
 * Verifies the master JWT.
 * Used on platform routes (user management, provisioning, etc.)
 */
function requirePlatformAuth(req, res, next) {
  const token = _extractBearer(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = verifyToken(token);
    if (payload.purpose !== 'master')
      return res.status(401).json({ error: 'Invalid token type' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Verifies the scoped token on product app routes.
 * Pass the expected appSlug to prevent cross-app token reuse.
 * Product apps import this middleware + their copy of public.pem.
 */
function requireScopedAuth(appSlug) {
  return (req, res, next) => {
    const token = _extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      const payload = verifyToken(token);
      if (payload.purpose !== 'scoped')
        return res.status(401).json({ error: 'Invalid token type' });
      if (appSlug && payload.app !== appSlug)
        return res.status(403).json({ error: 'Token not valid for this application' });
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * Page-level permission check.
 * Reads permissions from the scoped token — zero DB calls.
 * Usage: requirePage('affiliates', 'edit')
 */
const LEVEL = { none: 0, view: 1, edit: 2 };

function requirePage(pageKey, minLevel) {
  return (req, res, next) => {
    const role  = req.user?.role  || '';
    const perms = req.user?.permissions || {};

    // superuser and admin always pass through
    if (role === 'superuser' || role === 'admin') return next();

    const have = perms[pageKey] || 'none';
    if (LEVEL[have] >= LEVEL[minLevel]) return next();

    return res.status(403).json({
      error: `Requires ${minLevel} access to ${pageKey}`,
    });
  };
}

// ── Private ───────────────────────────────────────────────────────────────
function _extractBearer(req) {
  const h = req.headers.authorization || '';
  const [, token] = h.match(/^Bearer\s+(.+)$/i) || [];
  return token || null;
}

module.exports = {
  signMasterToken, signScopedToken, signTempToken, signVerifyToken,
  verifyToken, verifyTempToken,
  requirePlatformAuth, requireScopedAuth, requirePage,
  PUBLIC_KEY,
};
