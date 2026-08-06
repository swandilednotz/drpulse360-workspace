/**
 * DEV-ONLY login route — bypasses password + 2FA.
 * Only registers when NODE_ENV !== 'production'.
 * Remove or guard this in production.
 *
 * Usage: POST /api/auth/dev-login { email: "admin@drpl.com" }
 * Returns: { token: <master JWT> }
 */

const router  = require('express').Router();
const crypto  = require('crypto');
const { platform } = require('../db');
const { signMasterToken } = require('../middleware/auth');

async function getUserClientApps(userId) {
  const { rows } = await platform.query(
    `SELECT client_app_id FROM user_client_app_roles WHERE user_id = $1`,
    [userId]
  );
  return rows.map(r => r.client_app_id);
}

router.post('/', async (req, res) => {
  if (process.env.NODE_ENV === 'production')
    return res.status(404).json({ error: 'Not found' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const { rows } = await platform.query(
      `SELECT * FROM platform_users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE`,
      [email.trim()]
    );
    if (!rows.length)
      return res.status(404).json({ error: `No active user found: ${email}` });

    const user         = rows[0];
    const clientAppIds = await getUserClientApps(user.id);
    const token        = signMasterToken(user, clientAppIds);

    // Record session
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await platform.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user.id, hash]
    );

    console.log(`[dev-login] Issued token for ${email} — client_apps: [${clientAppIds.join(', ')}]`);
    res.json({ token });
  } catch (e) {
    console.error('[dev-login]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
