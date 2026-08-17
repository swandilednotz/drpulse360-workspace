-- ============================================================
-- DR Pulse 360 — migration 002
-- Per-user page permission overrides for 'custom' role users
-- ============================================================

-- Lets a Super User grant a specific user page-level permissions
-- that differ from their role's defaults, without creating a new
-- role. Keyed by page_key -> level ('none' | 'view' | 'edit').
-- NULL = no override, use role_permissions as-is.
ALTER TABLE user_client_app_roles
  ADD COLUMN IF NOT EXISTS permissions_override JSONB;
