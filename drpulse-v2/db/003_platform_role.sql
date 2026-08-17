-- ============================================================
-- DR Pulse 360 — migration 003
-- Add platform_role to platform_users
--
-- middleware/auth.js has always read `user.platform_role ?? 'viewer'`
-- when signing the master JWT, but platform-schema.sql never actually
-- defined this column — so every account silently signed in as
-- 'viewer' regardless of intent. This adds the column with the same
-- default the code already assumed, so existing rows keep behaving
-- exactly as they did before (viewer) until explicitly promoted.
-- ============================================================

ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'viewer';

-- Optional but recommended: constrain to known values so a typo doesn't
-- silently create a new, unrecognized role that nothing checks for.
ALTER TABLE platform_users
  DROP CONSTRAINT IF EXISTS platform_users_platform_role_check;

ALTER TABLE platform_users
  ADD CONSTRAINT platform_users_platform_role_check
  CHECK (platform_role IN ('viewer', 'superuser'));

CREATE INDEX IF NOT EXISTS idx_platform_users_platform_role
  ON platform_users(platform_role);
