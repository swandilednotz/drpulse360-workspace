/**
 * DEV-ONLY login route — bypasses password + 2FA.
 * Only registers when NODE_ENV !== 'production'.
 * Remove or guard this in production.
 *
 * Usage: POST /api/auth/dev-login { email: "admin@drpl.com" }
 * Returns: { token: <master JWT> }
 *
 * Reuses issueMasterJWT from ./auth so this never drifts from the real
 * login flow again — it previously hand-rolled its own token issuance
 * and was missing platform_role and tenant_name entirely as a result.
 */

const router = require('express').Router();
const { platform } = require('../db');
const { issueMasterJWT } = require('./auth');

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

    const user = rows[0];
    const { token, clientAppIds, tenantName } = await issueMasterJWT(user);

    console.log(`[dev-login] Issued token for ${email} — tenant: ${tenantName || '(none)'} — client_apps: [${clientAppIds.join(', ')}]`);
    res.json({ token });
  } catch (e) {
    console.error('[dev-login]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;