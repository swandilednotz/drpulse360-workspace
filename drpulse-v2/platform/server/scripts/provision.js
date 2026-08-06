#!/usr/bin/env node
/**
 * Provision a new tenant and their first product access.
 *
 * Usage:
 *   node scripts/provision.js \
 *     --tenant-slug sony \
 *     --tenant-name "SONY Broadcast" \
 *     --app srt-manager \
 *     --email admin@drpl.com \
 *     --name "SONY Admin"
 *
 * Optional:
 *   --password "TempPass123!"   (only for local auth)
 *   --provider google           (local | google | microsoft | both)
 */

require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { platform } = require('../db');
const { sendWelcomeEmail } = require('../mailer');

const args = process.argv.slice(2).reduce((acc, v, i, arr) => {
  if (v.startsWith('--')) acc[v.slice(2)] = arr[i + 1];
  return acc;
}, {});

const tenantSlug = args['tenant-slug'];
const tenantName = args['tenant-name'] || tenantSlug;
const appSlug    = args['app']         || 'srt-manager';
const email      = args['email'];
const name       = args['name'];
const password   = args['password'];
const provider   = args['provider']    || 'local';

if (!tenantSlug) {
  console.error('Usage: node provision.js --tenant-slug <slug> --app <app-slug> [options]');
  process.exit(1);
}

const DEFAULT_PERMISSIONS = {
  'srt-manager': {
    superuser: { dashboard:'edit', affiliates:'edit', channels:'edit', devices:'edit', ota:'edit', logs:'view', users:'edit', activity:'edit' },
    admin:     { dashboard:'edit', affiliates:'edit', channels:'edit', devices:'edit', ota:'edit', logs:'view', users:'none', activity:'view' },
    custom:    { dashboard:'view', affiliates:'none', channels:'none', devices:'none', ota:'none', logs:'none', users:'none', activity:'none' },
    viewer:    { dashboard:'view', affiliates:'view', channels:'view', devices:'view', ota:'none', logs:'none', users:'none', activity:'none' },
  },
};

async function run() {
  const client = await platform.connect();
  try {
    await client.query('BEGIN');

    // 1. Tenant
    let { rows } = await client.query(`SELECT id FROM tenants WHERE slug = $1`, [tenantSlug]);
    let tenantId;
    if (rows.length) {
      tenantId = rows[0].id;
      console.log(`✓ Tenant exists: ${tenantSlug}`);
    } else {
      ({ rows } = await client.query(
        `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`, [tenantSlug, tenantName]
      ));
      tenantId = rows[0].id;
      console.log(`✓ Created tenant: ${tenantSlug}`);
    }

    // 2. App
    const { rows: aRows } = await client.query(
      `SELECT id FROM apps WHERE slug = $1 AND is_active = TRUE`, [appSlug]
    );
    if (!aRows.length) { console.error(`✗ App not found: ${appSlug}`); process.exit(1); }
    const appId = aRows[0].id;

    // 3. client_app
    const clientAppId = `ca-${tenantSlug}-${appSlug.replace('-manager','').replace('-','')}`;
    const { rows: caCheck } = await client.query(
      `SELECT id FROM client_apps WHERE id = $1`, [clientAppId]
    );
    if (caCheck.length) {
      console.log(`⚠  client_app already exists: ${clientAppId}`);
    } else {
      await client.query(
        `INSERT INTO client_apps (id, tenant_id, app_id) VALUES ($1, $2, $3)`,
        [clientAppId, tenantId, appId]
      );
      console.log(`✓ Created client_app: ${clientAppId}`);
    }

    // 4. Roles + permissions
    const perms = DEFAULT_PERMISSIONS[appSlug] || {};
    for (const [roleName, pages] of Object.entries(perms)) {
      await client.query(
        `INSERT INTO roles (client_app_id, name, is_system) VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING`,
        [clientAppId, roleName]
      );
      for (const [pageKey, level] of Object.entries(pages)) {
        await client.query(
          `INSERT INTO role_permissions (client_app_id, role_name, page_key, level)
           VALUES ($1,$2,$3,$4) ON CONFLICT (client_app_id, role_name, page_key)
           DO UPDATE SET level = EXCLUDED.level`,
          [clientAppId, roleName, pageKey, level]
        );
      }
    }
    console.log(`✓ Roles and permissions seeded`);

    // 5. Super User
    if (email) {
      const verifyToken   = crypto.randomBytes(32).toString('hex');
      const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      let   passwordHash  = null;
      let   tempPassword  = null;

      if (provider === 'local' || provider === 'both') {
        tempPassword = password || crypto.randomBytes(10).toString('hex');
        passwordHash = await bcrypt.hash(tempPassword, 12);
      }

      const { rows: uRows } = await client.query(
        `INSERT INTO platform_users
           (tenant_id, email, name, password_hash, auth_provider,
            must_change_password, verify_token, verify_token_expires)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id, email) DO UPDATE SET name = COALESCE(EXCLUDED.name, platform_users.name)
         RETURNING id, email`,
        [tenantId, email.toLowerCase(), name || null, passwordHash, provider, provider === 'local', verifyToken, verifyExpires]
      );

      await client.query(
        `INSERT INTO user_client_app_roles (user_id, client_app_id, role_name)
         VALUES ($1,$2,'superuser') ON CONFLICT DO NOTHING`,
        [uRows[0].id, clientAppId]
      );

      console.log(`✓ Super User: ${email}`);
      if (tempPassword) console.log(`  Temp password: ${tempPassword}`);

      await sendWelcomeEmail({ to: email, name, verifyToken, tempPassword, auth_provider: provider })
        .catch(e => console.warn('  ⚠  Could not send welcome email:', e.message));
    }

    await client.query('COMMIT');
    console.log(`\n✓ Done. ${clientAppId} is ready.\n`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('✗ Failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await platform.end();
  }
}

run();
