require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { platform } = require('../db');
const { sendWelcomeEmail } = require('../mailer');

// ── Edit these ─────────────────────────────────────────────────────────────
const EMAIL    = 'strangeambivert@gmail.com';
const NAME     = 'Super User';
const PASSWORD = 'admin1234';   
const ROLE     = 'superuser';            // superuser | admin | viewer | custom
const CLIENT_APP_ID = 'ca-sony-srt';
// ──────────────────────────────────────────────────────────────────────────
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_HOST:', process.env.SMTP_HOST);

async function run() {
  const { rows: tenant } = await platform.query(
    `SELECT id FROM tenants WHERE slug = 'sony'`
  );
  if (!tenant.length) { console.error('Tenant sony not found'); process.exit(1); }
  const tenantId = tenant[0].id;

  const hash         = await bcrypt.hash(PASSWORD, 12);
  const verifyToken  = crypto.randomBytes(32).toString('hex');
  const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { rows: user } = await platform.query(
    `INSERT INTO platform_users
       (tenant_id, email, name, password_hash, auth_provider,
        email_verified, verify_token, verify_token_expires)
     VALUES ($1,$2,$3,$4,'local',TRUE,$5,$6)
     ON CONFLICT (tenant_id, email)
     DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
     RETURNING id, email`,
    [tenantId, EMAIL, NAME, hash, verifyToken, verifyExpiry]
  );

  await platform.query(
    `INSERT INTO user_client_app_roles (user_id, client_app_id, role_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, client_app_id) DO UPDATE SET role_name = EXCLUDED.role_name`,
    [user[0].id, CLIENT_APP_ID, ROLE]
  );

  console.log('Done:', user[0].email, '→', ROLE, 'in', CLIENT_APP_ID);
  await sendWelcomeEmail({
    to:           EMAIL,
    name:         NAME,
    verifyToken,
    tempPassword: PASSWORD,
    auth_provider: 'local',
  })
  .then(() => console.log('✓ Email sent to:', EMAIL))
  .catch(e  => console.error('✗ Email failed:', e.message));
  process.exit();
}

run().catch(e => { console.error(e.message); process.exit(1); });
