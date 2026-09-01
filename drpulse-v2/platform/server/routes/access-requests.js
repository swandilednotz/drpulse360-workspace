const router = require('express').Router();
const { platform, audit } = require('../db');
const { verifyToken, requirePlatformAuth } = require('../middleware/auth');
const { sendAccessRequestApprovedEmail, sendAccessRequestDeniedEmail } = require('../mailer');

// Product apps only hold a scoped token, not the master token, so the
// "create a request" endpoint accepts either token type — it just needs
// to know who the user is (sub), which tenant (tenant_id), and which
// product they're in (client_app_id, taken from the token itself so a
// caller can't request access under someone else's app).
function requireAnyPlatformToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    if (!['master', 'scoped'].includes(payload.purpose)) {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── POST /api/access-requests — request access to a page, or a whole set
//    of pages at once (new users with zero app access) ───────────────────
// Called either from inside a product app (scoped token, single page) or
// from DR Pulse itself (master token, permission-set form for onboarding).
router.post('/', requireAnyPlatformToken, async (req, res) => {
  const {
    page_key,                      // legacy: single-page request
    requested_level = 'view',      // legacy: single-page request
    requested_permissions,         // new: { page_key: 'view'|'edit' }, multi-page
    reason,
    client_app_id: bodyClientAppId,
  } = req.body;

  // Scoped tokens already know which client_app they're in; master tokens
  // (e.g. a brand-new user with no app assignments yet, submitting the
  // onboarding form from DR Pulse itself) must say so explicitly.
  const client_app_id = req.user.client_app_id || bodyClientAppId;
  if (!client_app_id) {
    return res.status(400).json({ error: 'client_app_id is required' });
  }

  const isPermissionSet = requested_permissions && typeof requested_permissions === 'object';
  const isGeneralRequest = !isPermissionSet && !page_key;

  // General request — no specific page to name (app has no defined page
  // list yet on the frontend), so the reason IS the request.
  if (isGeneralRequest && !reason?.trim()) {
    return res.status(400).json({ error: 'page_key, requested_permissions, or a reason is required' });
  }
  if (!isGeneralRequest && !isPermissionSet && !['view', 'edit'].includes(requested_level)) {
    return res.status(400).json({ error: "requested_level must be 'view' or 'edit'" });
  }
  if (isPermissionSet) {
    const validLevels = ['none', 'view', 'edit'];
    const bad = Object.values(requested_permissions).some(l => !validLevels.includes(l));
    if (bad) return res.status(400).json({ error: "permission levels must be 'none', 'view', or 'edit'" });
    // Don't record a request that's asking for nothing.
    if (!Object.values(requested_permissions).some(l => l !== 'none')) {
      return res.status(400).json({ error: 'Select at least one page' });
    }
  }

  try {
    const { rows } = await platform.query(
      `INSERT INTO access_requests
         (tenant_id, user_id, client_app_id, page_key, requested_level, requested_permissions, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, page_key, requested_level, requested_permissions, status, requested_at`,
      [
        req.user.tenant_id, req.user.sub, client_app_id,
        isPermissionSet ? null : (isGeneralRequest ? null : page_key),
        isPermissionSet ? null : (isGeneralRequest ? null : requested_level),
        isPermissionSet ? JSON.stringify(requested_permissions) : null,
        reason || null,
      ]
    );
    await audit(req.user.tenant_id, req.user.sub, client_app_id, 'access_requested',
      isPermissionSet ? { requested_permissions } : isGeneralRequest ? { reason } : { page_key, requested_level });
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[access-requests/create]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/access-requests — list requests for the tenant ──────────────
// Super User only. ?status=pending (default) | approved | denied | all
router.get('/', requirePlatformAuth, async (req, res) => {
  if (req.user.platform_role !== 'superuser') {
    return res.status(403).json({ error: 'Super User access required' });
  }
  const status = req.query.status || 'pending';
  try {
    const { rows } = await platform.query(
      `SELECT ar.id, ar.page_key, ar.requested_level, ar.requested_permissions,
              ar.reason, ar.status, ar.requested_at, ar.resolved_at,
              u.id AS user_id, u.email AS user_email, u.name AS user_name,
              ca.id AS client_app_id, a.slug AS app_slug, a.name AS app_name
         FROM access_requests ar
         JOIN platform_users u   ON u.id  = ar.user_id
         JOIN client_apps    ca  ON ca.id = ar.client_app_id
         JOIN apps           a   ON a.id  = ca.app_id
        WHERE ar.tenant_id = $1
          AND ($2 = 'all' OR ar.status = $2)
        ORDER BY ar.requested_at DESC`,
      [req.user.tenant_id, status]
    );
    res.json(rows);
  } catch (e) {
    console.error('[access-requests/list]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/access-requests/:id/approve — grant the requested access ──
router.patch('/:id/approve', requirePlatformAuth, async (req, res) => {
  if (req.user.platform_role !== 'superuser') {
    return res.status(403).json({ error: 'Super User access required' });
  }
  const client = await platform.connect();
  try {
    await client.query('BEGIN');

    const { rows: reqRows } = await client.query(
      `SELECT ar.*, u.email AS user_email, u.name AS user_name, a.name AS app_name
         FROM access_requests ar
         JOIN platform_users u  ON u.id  = ar.user_id
         JOIN client_apps    ca ON ca.id = ar.client_app_id
         JOIN apps           a  ON a.id  = ca.app_id
        WHERE ar.id = $1 AND ar.tenant_id = $2 AND ar.status = 'pending'
        FOR UPDATE OF ar`,
      [req.params.id, req.user.tenant_id]
    );
    if (!reqRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found or already resolved' });
    }
    const ar = reqRows[0];
    // General request (reason only, no specific page — app had no defined
    // page list on the frontend) has neither field set. There's nothing
    // specific to merge, so approving it grants base access via the app's
    // default 'viewer' role permissions instead of a custom override.
    const isGeneralRequest = !ar.requested_permissions && !ar.page_key;
    const requestedSet = ar.requested_permissions || (isGeneralRequest ? null : { [ar.page_key]: ar.requested_level });

    // Merge the granted page(s) into whatever override the user already has,
    // creating a 'custom'-style assignment if they had none in this app —
    // this is also how a brand-new user with zero apps gets their first one.
    const { rows: existing } = await client.query(
      `SELECT role_name, permissions_override FROM user_client_app_roles
        WHERE user_id = $1 AND client_app_id = $2`,
      [ar.user_id, ar.client_app_id]
    );

    const roleName = existing.length ? existing[0].role_name : (isGeneralRequest ? 'viewer' : 'custom');
    const override  = isGeneralRequest
      ? (existing[0]?.permissions_override || null)
      : { ...(existing[0]?.permissions_override || {}), ...requestedSet };

    await client.query(
      `INSERT INTO user_client_app_roles (user_id, client_app_id, role_name, permissions_override)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, client_app_id) DO UPDATE
         SET permissions_override = EXCLUDED.permissions_override`,
      [ar.user_id, ar.client_app_id, roleName, override ? JSON.stringify(override) : null]
    );

    await client.query(
      `UPDATE access_requests
          SET status = 'approved', resolved_at = NOW(), resolved_by = $1
        WHERE id = $2`,
      [req.user.sub, ar.id]
    );

    await client.query(
      `INSERT INTO audit_log (tenant_id, user_id, client_app_id, action, detail)
       VALUES ($1, $2, $3, 'access_request_approved', $4)`,
      [req.user.tenant_id, req.user.sub, ar.client_app_id,
        JSON.stringify({ target: ar.user_id, granted: requestedSet })]
    );

    await client.query('COMMIT');

    sendAccessRequestApprovedEmail({
      to: ar.user_email, name: ar.user_name, appName: ar.app_name, permissions: requestedSet,
    }).catch(e => console.error('[access-requests/approve] email error:', e.message));

    res.json({ message: 'Access granted. Takes effect the next time the user logs in.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[access-requests/approve]', e.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ── PATCH /api/access-requests/:id/deny ───────────────────────────────────
router.patch('/:id/deny', requirePlatformAuth, async (req, res) => {
  if (req.user.platform_role !== 'superuser') {
    return res.status(403).json({ error: 'Super User access required' });
  }
  try {
    const { rows } = await platform.query(
      `UPDATE access_requests ar
          SET status = 'denied', resolved_at = NOW(), resolved_by = $1
        WHERE ar.id = $2 AND ar.tenant_id = $3 AND ar.status = 'pending'
        RETURNING ar.id, ar.page_key, ar.user_id, ar.client_app_id`,
      [req.user.sub, req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found or already resolved' });

    const { rows: detailRows } = await platform.query(
      `SELECT u.email AS user_email, u.name AS user_name, a.name AS app_name
         FROM platform_users u, client_apps ca, apps a
        WHERE u.id = $1 AND ca.id = $2 AND a.id = ca.app_id`,
      [rows[0].user_id, rows[0].client_app_id]
    );

    await audit(req.user.tenant_id, req.user.sub, rows[0].client_app_id, 'access_request_denied',
      { target: rows[0].user_id, page_key: rows[0].page_key });

    if (detailRows.length) {
      sendAccessRequestDeniedEmail({
        to: detailRows[0].user_email, name: detailRows[0].user_name, appName: detailRows[0].app_name,
      }).catch(e => console.error('[access-requests/deny] email error:', e.message));
    }

    res.json({ message: 'Request denied' });
  } catch (e) {
    console.error('[access-requests/deny]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;