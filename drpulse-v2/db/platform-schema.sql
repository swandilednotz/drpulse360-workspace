-- ============================================================
-- DR Pulse 360 — srt_platform
-- Control plane: identity, access, roles, sessions, audit
-- No payment / billing tables
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TENANTS ──────────────────────────────────────────────────
-- One row per client company (SONY, STAR, etc.)
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT        NOT NULL UNIQUE,     -- e.g. "sony"
  name       TEXT        NOT NULL,            -- e.g. "SONY Broadcast"
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── APPS ─────────────────────────────────────────────────────
-- One row per product (SRT Manager, Analytics, CMS...)
-- Registered by DRPL — clients cannot add their own apps
CREATE TABLE IF NOT EXISTS apps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT        NOT NULL UNIQUE,  -- e.g. "srt-manager"
  name       TEXT        NOT NULL,         -- e.g. "SRT Manager"
  db_name    TEXT        NOT NULL UNIQUE,  -- real postgres DB name
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CLIENT_APPS ───────────────────────────────────────────────
-- The bridge between a tenant and a product they have access to.
-- SONY subscribes to SRT Manager → one row: (sony, srt-manager)
-- SONY subscribes to Analytics   → another row: (sony, analytics)
-- id is human-readable: "ca-sony-srt", "ca-star-analytics"
CREATE TABLE IF NOT EXISTS client_apps (
  id           TEXT        PRIMARY KEY,           -- "ca-sony-srt"
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id       UUID        NOT NULL REFERENCES apps(id)    ON DELETE CASCADE,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, app_id)
);

-- ── PLATFORM_USERS ────────────────────────────────────────────
-- Every person who can log in. Belongs to one tenant.
-- Identity only — no product-specific data here.
CREATE TABLE IF NOT EXISTS platform_users (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 TEXT,
  email                TEXT        NOT NULL,
  email_verified       BOOLEAN     NOT NULL DEFAULT FALSE,
  verify_token         TEXT,                       -- one-time email verification token
  verify_token_expires TIMESTAMPTZ,

  -- Local auth
  password_hash        TEXT,                       -- bcrypt cost 12. NULL for OAuth-only users
  reset_token          TEXT,
  reset_token_expires  TIMESTAMPTZ,
  must_change_password BOOLEAN     NOT NULL DEFAULT FALSE,

  -- OAuth
  auth_provider        TEXT        NOT NULL DEFAULT 'local',
  -- 'local' | 'google' | 'microsoft' | 'both'
  google_id            TEXT,                       -- Google's permanent sub claim
  microsoft_id         TEXT,                       -- Microsoft's permanent oid claim

  -- 2FA (only required for local auth)
  totp_secret          TEXT,                       -- AES-256-GCM encrypted
  totp_enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
  backup_codes         TEXT[],                     -- bcrypt hashes of single-use codes

  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, email)
);

-- ── ROLES ─────────────────────────────────────────────────────
-- Roles are scoped per client_app — not global.
-- SRT Manager has its own roles independent of Analytics.
-- is_system = TRUE means DRPL seeded it, Super Users cannot delete it.
CREATE TABLE IF NOT EXISTS roles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_app_id TEXT        NOT NULL REFERENCES client_apps(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,   -- "admin", "custom", "viewer"
  is_system     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_app_id, name)
);

-- ── ROLE_PERMISSIONS ──────────────────────────────────────────
-- What each role can do per page inside a product.
-- level: 'edit' | 'view' | 'none'
CREATE TABLE IF NOT EXISTS role_permissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_app_id TEXT        NOT NULL REFERENCES client_apps(id) ON DELETE CASCADE,
  role_name     TEXT        NOT NULL,
  page_key      TEXT        NOT NULL,   -- e.g. "affiliates", "devices", "channels"
  level         TEXT        NOT NULL DEFAULT 'none',
  UNIQUE (client_app_id, role_name, page_key)
);

-- ── USER_CLIENT_APP_ROLES ─────────────────────────────────────
-- Which role each user has in each client_app.
-- One user can have different roles in different client_apps.
-- Saloni: admin in ca-sony-srt, viewer in ca-sony-analytics
CREATE TABLE IF NOT EXISTS user_client_app_roles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  client_app_id TEXT        NOT NULL REFERENCES client_apps(id)    ON DELETE CASCADE,
  role_name     TEXT        NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_app_id)
);

-- ── SESSIONS ─────────────────────────────────────────────────
-- Tracks active login sessions. Created when master JWT is issued.
-- token_hash = SHA-256 of the master JWT (not the JWT itself).
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ             -- NULL = still active
);

-- ── AUDIT_LOG ────────────────────────────────────────────────
-- Append-only. Records every significant platform action.
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL   PRIMARY KEY,
  tenant_id     UUID        REFERENCES tenants(id)          ON DELETE SET NULL,
  user_id       UUID        REFERENCES platform_users(id)   ON DELETE SET NULL,
  client_app_id TEXT        REFERENCES client_apps(id)      ON DELETE SET NULL,
  action        TEXT        NOT NULL,        -- e.g. "login", "user_created", "role_changed"
  resource_type TEXT,                        -- e.g. "user", "role", "client_app"
  resource_id   TEXT,
  detail        JSONB       DEFAULT '{}',    -- before/after or extra context
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_platform_users_tenant    ON platform_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_users_email     ON platform_users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_platform_users_google    ON platform_users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_users_microsoft ON platform_users(microsoft_id) WHERE microsoft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_apps_tenant       ON client_apps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ucar_user                ON user_client_app_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_ucar_client_app          ON user_client_app_roles(client_app_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_client_app    ON role_permissions(client_app_id, role_name);
CREATE INDEX IF NOT EXISTS idx_sessions_user            ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires         ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_tenant             ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user               ON audit_log(user_id,   created_at DESC);

-- ── AUTO-UPDATE updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON platform_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── SEED: register SRT Manager ───────────────────────────────
INSERT INTO apps (slug, name, db_name)
VALUES ('srt-manager', 'SRT Manager', 'srt_manager')
ON CONFLICT (slug) DO NOTHING;
