const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { platform, audit } = require('../db');
const { requirePlatformAuth } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../mailer');

// Default page permissions seeded when a client_app is provisioned.
// Add new products here as they are built.
const DEFAULT_PERMISSIONS = {
  'srt-manager': {
    superuser: {
      dashboard: 'edit', affiliates: 'edit', channels: 'edit',
      devices: 'edit', ota: 'edit', logs: 'view', users: 'edit', activity: 'edit',
    },
    admin: {
      dashboard: 'edit', affiliates: 'edit', channels: 'edit',
      devices: 'edit', ota: 'edit', logs: 'view', users: 'none', activity: 'view',
    },
    custom: {
      dashboard: 'view', affiliates: 'none', channels: 'none',
      devices: 'none', ota: 'none', logs: 'none', users: 'none', activity: 'none',
    },
    viewer: {
      dashboard: 'view', affiliates: 'view', channels: 'view',
      devices: 'view', ota: 'none', logs: 'none', users: 'none', activity: 'none',
    },
  },
};

// ── POST /api/client-apps/provision ──────────────────────────────────────
// Onboard a new tenant to a product.
// Creates: client_app row, roles, permissions, optional first Super User.
router.post('/provision', async (req, res) => {
  const {
    tenant_slug,
    app_slug,
    superuser_email,
    superuser_name,
    superuser_password,
    auth_provider = 'local',   // how the super user will log in
  } = req.body;

  if (!tenant_slug || !app_slug)
    return res.status(400).json({ error: 'tenant_slug and app_slug are required' });

  const client = await platform.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve tenant
    let { rows: tRows } = await client.query(
      `SELECT id FROM tenants WHERE slug = $1`, [tenant_slug]
    );
    if (!tRows.length)
      return res.status(404).json({ error: `Tenant not found: ${tenant_slug}` });
    const tenantId = tRows[0].id;

    // 2. Resolve app
    const { rows: aRows } = await client.query(
      `SELECT id, slug FROM apps WHERE slug = $1 AND is_active = TRUE`, [app_slug]
    );
    if (!aRows.length)
      return res.status(404).json({ error: `App not found: ${app_slug}` });
    const appId = aRows[0].id;

    // 3. Create client_app (idempotent)
    const clientAppId = `ca-${tenant_slug}-${app_slug.replace('-manager', '').replace('-', '')}`;
    const { rows: existing } = await client.query(
      `SELECT id FROM client_apps WHERE id = $1`, [clientAppId]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Already provisioned: ${clientAppId}` });
    }

    await client.query(
      `INSERT INTO client_apps (id, tenant_id, app_id) VALUES ($1, $2, $3)`,
      [clientAppId, tenantId, appId]
    );

    // 4. Seed roles + permissions
    const perms = DEFAULT_PERMISSIONS[app_slug] || {};
    for (const [roleName, pages] of Object.entries(perms)) {
      await client.query(
        `INSERT INTO roles (client_app_id, name, is_system) VALUES ($1, $2, TRUE)
         ON CONFLICT (client_app_id, name) DO NOTHING`,
        [clientAppId, roleName]
      );
      for (const [pageKey, level] of Object.entries(pages)) {
        await client.query(
          `INSERT INTO role_permissions (client_app_id, role_name, page_key, level)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (client_app_id, role_name, page_key) DO UPDATE SET level = EXCLUDED.level`,
          [clientAppId, roleName, pageKey, level]
        );
      }
    }

    // 5. Create Super User (optional)
    let createdUser = null;
    if (superuser_email) {
      const verifyToken   = crypto.randomBytes(32).toString('hex');
      const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      let passwordHash = null;
      let tempPassword = null;
      if (auth_provider === 'local' || auth_provider === 'both') {
        tempPassword = superuser_password || crypto.randomBytes(10).toString('hex');
        passwordHash = await bcrypt.hash(tempPassword, 12);
      }

      const { rows: uRows } = await client.query(
        `INSERT INTO platform_users
           (tenant_id, email, name, password_hash, auth_provider,
            must_change_password, verify_token, verify_token_expires)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, email) DO UPDATE
           SET name = COALESCE(EXCLUDED.name, platform_users.name)
         RETURNING id, email, name`,
        [
          tenantId, superuser_email.toLowerCase().trim(),
          superuser_name || null, passwordHash, auth_provider,
          auth_provider === 'local', verifyToken, verifyExpires,
        ]
      );
      const userId = uRows[0].id;

      await client.query(
        `INSERT INTO user_client_app_roles (user_id, client_app_id, role_name)
         VALUES ($1, $2, 'superuser')
         ON CONFLICT (user_id, client_app_id) DO UPDATE SET role_name = 'superuser'`,
        [userId, clientAppId]
      );

      createdUser = { id: userId, email: uRows[0].email, name: uRows[0].name };

      // Send welcome email (non-blocking)
      sendWelcomeEmail({
        to:          superuser_email,
        name:        superuser_name,
        verifyToken,
        tempPassword,
        auth_provider,
      }).catch(e => console.error('[provision] email error:', e.message));
    }

    await client.query(
      `INSERT INTO audit_log (tenant_id, client_app_id, action, detail)
       VALUES ($1, $2, 'client_app_provisioned', $3)`,
      [tenantId, clientAppId, JSON.stringify({ app_slug, superuser_email })]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message:       `Provisioned: ${clientAppId}`,
      client_app_id: clientAppId,
      tenant_slug,
      app_slug,
      superuser:     createdUser,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[provision]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── GET /api/client-apps  — list all (DRPL admin) ────────────────────────
router.get('/', requirePlatformAuth, async (req, res) => {
  try {
    const { rows } = await platform.query(
      `SELECT ca.id, ca.is_active, ca.activated_at,
              t.slug AS tenant_slug, t.name AS tenant_name,
              a.slug AS app_slug, a.name AS app_name
         FROM client_apps ca
         JOIN tenants t ON t.id = ca.tenant_id
         JOIN apps    a ON a.id = ca.app_id
        ORDER BY t.slug, a.slug`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/client-apps/mine  — current user's assigned client_apps ─────
// Used by the frontend to build the app launcher.
router.get('/mine', requirePlatformAuth, async (req, res) => {
  try {
    const { rows } = await platform.query(
      `SELECT ca.id, ca.is_active,
              a.slug AS app_slug, a.name AS app_name,
              r.role_name AS role
         FROM user_client_app_roles r
         JOIN client_apps ca ON ca.id = r.client_app_id
         JOIN apps        a  ON a.id  = ca.app_id
        WHERE r.user_id = $1 AND ca.is_active = TRUE
        ORDER BY a.name`,
      [req.user.sub]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ── GET /api/client-apps/all  — all apps for tenant, with access flag ────
// Used by the launcher to show locked tiles for apps the user can request.
router.get('/all', requirePlatformAuth, async (req, res) => {
  try {
    const { rows } = await platform.query(
      `SELECT ca.id, ca.is_active,
              a.slug AS app_slug, a.name AS app_name,
              r.role_name AS role,
              CASE WHEN r.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_access
         FROM client_apps ca
         JOIN apps a ON a.id = ca.app_id
         JOIN tenants t ON t.id = ca.tenant_id
         JOIN platform_users u ON u.id = $1
         LEFT JOIN user_client_app_roles r
           ON r.client_app_id = ca.id AND r.user_id = $1
        WHERE u.tenant_id = t.id AND ca.is_active = TRUE
        ORDER BY a.name`,
      [req.user.sub]
    );
    res.json(rows);
  } catch (e) {
    console.error('[client-apps/all]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/client-apps/:id/deactivate  — suspend a client's product access
router.patch('/:id/deactivate', requirePlatformAuth, async (req, res) => {
  try {
    const { rows } = await platform.query(
      `UPDATE client_apps SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    await audit(null, req.user.sub, req.params.id, 'client_app_deactivated');
    res.json({ message: `${req.params.id} deactivated. Users will be locked out on next token expiry.` });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
