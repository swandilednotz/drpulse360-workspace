const { Pool } = require('pg');

// ── Platform DB (srt_platform) ────────────────────────────────────────────
// The control plane — tenants, users, roles, sessions, audit.
// Never contains product operational data.
const platform = new Pool({
  host:     process.env.PLATFORM_DB_HOST     || 'localhost',
  port:     parseInt(process.env.PLATFORM_DB_PORT || '5432'),
  database: process.env.PLATFORM_DB_NAME     || 'srt_platform',
  user:     process.env.PLATFORM_DB_USER     || 'postgres',
  password: process.env.PLATFORM_DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis:  5_000,
});

platform.on('error', (err) => {
  console.error('[platform-db] Unexpected error:', err.message);
});

// ── Product DBs ───────────────────────────────────────────────────────────
// One pool per product database (srt_manager, analytics, etc.)
// Created lazily on first use and cached.
// Uses the srt_app role so RLS is enforced (postgres superuser bypasses RLS).
const productPools = {};

function getProductDb(dbName) {
  if (!productPools[dbName]) {
    productPools[dbName] = new Pool({
      host:     process.env.PRODUCT_DB_HOST     || process.env.PLATFORM_DB_HOST || 'localhost',
      port:     parseInt(process.env.PRODUCT_DB_PORT || process.env.PLATFORM_DB_PORT || '5432'),
      database: dbName,
      user:     process.env.PRODUCT_DB_USER     || 'srt_app',
      password: process.env.PRODUCT_DB_PASSWORD || 'change_in_production',
      max: 10,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis:  5_000,
    });
    productPools[dbName].on('error', (err) => {
      console.error(`[product-db:${dbName}] Unexpected error:`, err.message);
    });
    console.log(`[db] Pool created for product DB: ${dbName}`);
  }
  return productPools[dbName];
}

// ── Workspace-scoped query ────────────────────────────────────────────────
// Always use this instead of pool.query() for product databases.
// Sets app.client_app_id before the query so RLS fires automatically.
async function clientQuery(dbName, clientAppId, sql, params = []) {
  const pool   = getProductDb(dbName);
  const client = await pool.connect();
  try {
    await client.query('SET LOCAL app.client_app_id = $1', [clientAppId]);
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ── Audit helper ─────────────────────────────────────────────────────────
async function audit(tenantId, userId, clientAppId, action, detail = {}, ip = null) {
  try {
    await platform.query(
      `INSERT INTO audit_log (tenant_id, user_id, client_app_id, action, detail, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId || null, userId || null, clientAppId || null, action, JSON.stringify(detail), ip || null]
    );
  } catch (e) {
    console.error('[audit]', e.message);
  }
}

module.exports = { platform, getProductDb, clientQuery, audit };
