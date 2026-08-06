const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { platform, audit } = require('../db');
const { requirePlatformAuth } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../mailer');

// ── POST /api/users  — create a new user (Super User only) ───────────────
router.post('/', requirePlatformAuth, async (req, res) => {
  const {
    email,
    name,
    auth_provider = 'local',   // 'local' | 'google' | 'microsoft' | 'both'
    client_app_id,
    role_name     = 'viewer',
    password,                  // optional — generated if not provided for local users
  } = req.body;

  if (!email || !client_app_id)
    return res.status(400).json({ error: 'email and client_app_id are required' });

  const client = await platform.connect();
  try {
    await client.query('BEGIN');

    // Ensure client_app belongs to the same tenant as the requesting user
    const { rows: caRows } = await client.query(
      `SELECT tenant_id FROM client_apps WHERE id = $1`, [client_app_id]
    );
    if (!caRows.length)
      return res.status(404).json({ error: 'client_app not found' });
    if (caRows[0].tenant_id !== req.user.tenant_id)
      return res.status(403).json({ error: 'Cannot add users to another tenant' });

    const tenantId      = req.user.tenant_id;
    const verifyToken   = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    let passwordHash = null;
    let tempPassword = null;
    if (auth_provider === 'local' || auth_provider === 'both') {
      tempPassword = password || crypto.randomBytes(10).toString('hex');
      passwordHash = await bcrypt.hash(tempPassword, 12);
    }

    // Create or update the user
    const { rows: uRows } = await client.query(
      `INSERT INTO platform_users
         (tenant_id, email, name, password_hash, auth_provider,
          must_change_password, verify_token, verify_token_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, email) DO UPDATE
         SET name          = COALESCE(EXCLUDED.name, platform_users.name),
             auth_provider = EXCLUDED.auth_provider
       RETURNING id, email, name, auth_provider`,
      [
        tenantId, email.toLowerCase().trim(), name || null, passwordHash,
        auth_provider, auth_provider === 'local', verifyToken, verifyExpires,
      ]
    );
    const user = uRows[0];

    // Assign role in client_app
    await client.query(
      `INSERT INTO user_client_app_roles (user_id, client_app_id, role_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, client_app_id) DO UPDATE SET role_name = EXCLUDED.role_name`,
      [user.id, client_app_id, role_name]
    );

    await client.query(
      `INSERT INTO audit_log (tenant_id, user_id, client_app_id, action, detail)
       VALUES ($1, $2, $3, 'user_created', $4)`,
      [tenantId, req.user.sub, client_app_id, JSON.stringify({ email, role_name, auth_provider })]
    );

    await client.query('COMMIT');

    // Send welcome email (non-blocking)
    sendWelcomeEmail({ to: email, name, verifyToken, tempPassword, auth_provider })
      .catch(e => console.error('[users/create] email error:', e.message));

    res.status(201).json({
      id:          user.id,
      email:       user.email,
      name:        user.name,
      auth_provider,
      client_app_id,
      role_name,
      temp_password: tempPassword,   // return so Super User can share if needed
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[users/create]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── GET /api/users  — list users in the requesting user's tenant ──────────
router.get('/', requirePlatformAuth, async (req, res) => {
  try {
    const { rows } = await platform.query(
      `SELECT u.id, u.email, u.name, u.auth_provider, u.is_active,
              u.totp_enabled, u.last_login_at, u.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'client_app_id', r.client_app_id,
                    'role', r.role_name
                  )
                ) FILTER (WHERE r.client_app_id IS NOT NULL),
                '[]'
              ) AS assignments
         FROM platform_users u
         LEFT JOIN user_client_app_roles r ON r.user_id = u.id
        WHERE u.tenant_id = $1
        GROUP BY u.id
        ORDER BY u.created_at DESC`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── PATCH /api/users/:id  — update user details ───────────────────────────
router.patch('/:id', requirePlatformAuth, async (req, res) => {
  const { name, auth_provider, is_active } = req.body;
  try {
    const { rows } = await platform.query(
      `UPDATE platform_users
          SET name          = COALESCE($1, name),
              auth_provider = COALESCE($2, auth_provider),
              is_active     = COALESCE($3, is_active)
        WHERE id = $4 AND tenant_id = $5
        RETURNING id, email, name, auth_provider, is_active`,
      [name || null, auth_provider || null, is_active ?? null, req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    await audit(req.user.tenant_id, req.user.sub, null, 'user_updated', { target: req.params.id });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── PATCH /api/users/:id/role  — change a user's role in a client_app ────
router.patch('/:id/role', requirePlatformAuth, async (req, res) => {
  const { client_app_id, role_name } = req.body;
  if (!client_app_id || !role_name)
    return res.status(400).json({ error: 'client_app_id and role_name required' });
  try {
    await platform.query(
      `INSERT INTO user_client_app_roles (user_id, client_app_id, role_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, client_app_id) DO UPDATE SET role_name = EXCLUDED.role_name`,
      [req.params.id, client_app_id, role_name]
    );
    await audit(req.user.tenant_id, req.user.sub, client_app_id, 'role_changed',
      { target: req.params.id, new_role: role_name });
    res.json({ message: 'Role updated' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/users/:id/reset-2fa  — Super User resets a user's 2FA ──────
router.post('/:id/reset-2fa', requirePlatformAuth, async (req, res) => {
  try {
    const { rows } = await platform.query(
      `UPDATE platform_users
          SET totp_enabled = FALSE, totp_secret = NULL, backup_codes = NULL
        WHERE id = $1 AND tenant_id = $2
        RETURNING email`,
      [req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    await audit(req.user.tenant_id, req.user.sub, null, '2fa_reset_by_admin',
      { target: rows[0].email });
    res.json({ message: `2FA reset for ${rows[0].email}. They will set it up again on next login.` });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── DELETE /api/users/:id  — remove user from tenant ─────────────────────
router.delete('/:id', requirePlatformAuth, async (req, res) => {
  try {
    const { rows } = await platform.query(
      `UPDATE platform_users SET is_active = FALSE
        WHERE id = $1 AND tenant_id = $2 RETURNING email`,
      [req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    await audit(req.user.tenant_id, req.user.sub, null, 'user_deactivated',
      { target: rows[0].email });
    res.json({ message: `${rows[0].email} deactivated` });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
