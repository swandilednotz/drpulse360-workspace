-- ============================================================
-- DR Pulse 360 — migration 002
-- Per-user page permission overrides + Request Access workflow
-- ============================================================

-- Lets a Super User grant a specific user page-level permissions
-- that differ from their role's defaults, without creating a new
-- role. Keyed by page_key -> level ('none' | 'view' | 'edit').
-- NULL = no override, use role_permissions as-is.
ALTER TABLE user_client_app_roles
  ADD COLUMN IF NOT EXISTS permissions_override JSONB;

-- ── ACCESS_REQUESTS ─────────────────────────────────────────────
-- A user asking for access to a page (or higher level) inside a
-- product they're already assigned to (or requesting a page they
-- currently have 'none' on). Reviewed by a tenant Super User.
CREATE TABLE IF NOT EXISTS access_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id)        ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  client_app_id    TEXT        NOT NULL REFERENCES client_apps(id)    ON DELETE CASCADE,
  page_key         TEXT        NOT NULL,
  requested_level  TEXT        NOT NULL DEFAULT 'view',  -- 'view' | 'edit'
  reason           TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'denied'
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID        REFERENCES platform_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_access_requests_tenant_status
  ON access_requests(tenant_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_user
  ON access_requests(user_id, requested_at DESC);
