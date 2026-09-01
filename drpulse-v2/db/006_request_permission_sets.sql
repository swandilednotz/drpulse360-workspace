-- ============================================================
-- DR Pulse 360 — migration 006
-- Support full-permission-set access requests (new user onboarding)
--
-- The original access_requests design was for a user who already had
-- some access asking for more on ONE page (page_key/requested_level).
-- New users with zero app access need to request a whole set of pages
-- at once — this adds a JSONB column for that case. Both request
-- shapes coexist: page_key/requested_level stay for the single-page
-- flow (SRT Manager's RequestAccess.jsx), requested_permissions is
-- used by the new onboarding form.
-- ============================================================

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS requested_permissions JSONB;

-- Old columns are now optional — a request is either "one page" (legacy)
-- or "a permission set" (new), never both.
ALTER TABLE access_requests
  ALTER COLUMN page_key DROP NOT NULL,
  ALTER COLUMN requested_level DROP NOT NULL;
