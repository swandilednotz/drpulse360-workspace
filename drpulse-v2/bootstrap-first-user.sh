#!/usr/bin/env bash
#
# bootstrap-first-user.sh
#
# Run this ONCE, right after the very first `docker compose up --build -d`
# on a brand-new deployment — the database starts genuinely empty (no
# tenants, no users), so there's no superuser to log in as and use the
# normal "Add User" flow yet. This script creates that first account
# directly, via SQL. Every user after this one should be added through
# the actual DR Pulse UI, not this script.
#
# Usage:
#      ./bootstrap-first-user.sh "Sony" sony superuser@example.com "Super User"
#
# Requires: the platform-db container already running and healthy.

set -euo pipefail

TENANT_NAME="${1:?Usage: $0 <tenant-name> <tenant-slug> <admin-email> <admin-name>}"
TENANT_SLUG="${2:?Usage: $0 <tenant-name> <tenant-slug> <admin-email> <admin-name>}"
ADMIN_EMAIL="${3:?Usage: $0 <tenant-name> <tenant-slug> <admin-email> <admin-name>}"
ADMIN_NAME="${4:?Usage: $0 <tenant-name> <tenant-slug> <admin-email> <admin-name>}"

# Auto-detect the db container name (docker compose derives it from the
# folder name — this matches "drpulse-v2-platform-db-1" if run from a
# folder called drpulse-v2, but we detect it rather than hardcode it,
# since the production folder name might differ).
DB_CONTAINER=$(docker ps --filter "name=platform-db" --format "{{.Names}}" | head -n1)

if [ -z "$DB_CONTAINER" ]; then
  echo "ERROR: no running container matching 'platform-db' found." >&2
  echo "Is the stack up? Check: docker compose ps" >&2
  exit 1
fi

echo "Using database container: $DB_CONTAINER"

# Generate a strong random password — this is printed once at the end and
# is NOT recoverable afterward. Record it immediately.
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-20)

# ── Create the tenant ────────────────────────────────────────────────────
TENANT_ID=$(docker exec -i "$DB_CONTAINER" psql -U postgres -d srt_platform -t -A -c \
  "INSERT INTO tenants (name, slug) VALUES ('${TENANT_NAME}', '${TENANT_SLUG}') RETURNING id;")

if [ -z "$TENANT_ID" ]; then
  echo "ERROR: tenant creation failed — see output above." >&2
  exit 1
fi

echo "Tenant created: ${TENANT_NAME} (${TENANT_ID})"

# ── Create the superuser ─────────────────────────────────────────────────
# crypt()/gen_salt('bf', 12) requires the pgcrypto extension — already
# enabled by platform-schema.sql (it's what gen_random_uuid() depends on
# too), so no extra setup needed here.
USER_ID=$(docker exec -i "$DB_CONTAINER" psql -U postgres -d srt_platform -t -A -c \
  "INSERT INTO platform_users
     (tenant_id, email, name, password_hash, auth_provider,
      is_active, email_verified, must_change_password, platform_role)
   VALUES (
     '${TENANT_ID}', '${ADMIN_EMAIL}', '${ADMIN_NAME}',
     crypt('${ADMIN_PASSWORD}', gen_salt('bf', 12)),
     'local', TRUE, TRUE, TRUE, 'superuser'
   )
   RETURNING id;")

if [ -z "$USER_ID" ]; then
  echo "ERROR: user creation failed — see output above." >&2
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo " First superuser created — SAVE THIS NOW, shown only once:"
echo "════════════════════════════════════════════════════════════"
echo " Tenant:   ${TENANT_NAME}"
echo " Email:    ${ADMIN_EMAIL}"
echo " Password: ${ADMIN_PASSWORD}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "must_change_password is set to TRUE, so this person will be"
echo "required to set their own password on first login."
echo ""
echo "Everyone after this account should be added via the DR Pulse"
echo "'Add User' UI at https://drpulse.drmonitoring.com — not this script."
