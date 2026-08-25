#!/usr/bin/env bash
#
# Creates (or recreates) the local Postgres database the test suite runs against,
# and applies every migration to it.
#
# The suite writes real rows, so it must never share a database with the
# application. test-support/db-guard.mjs enforces that at run time; this script
# makes the local database easy enough to create that nobody is tempted to point
# the tests somewhere shared.
#
# Usage:  npm run db:test:setup
#         npm run db:test:setup -- --reset     (drop and recreate first)

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.test"

if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE found. Copy .env.test.example to $ENV_FILE first." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

if [ "${VE_TEST_DATABASE:-}" != "1" ]; then
  echo "$ENV_FILE does not set VE_TEST_DATABASE=1 — refusing to touch that database." >&2
  exit 1
fi

DB_NAME="$(node -e 'process.stdout.write(new URL(process.env.DATABASE_URL).pathname.slice(1))')"
DB_HOST="$(node -e 'process.stdout.write(new URL(process.env.DATABASE_URL).hostname)')"

if [ "$DB_HOST" != "localhost" ] && [ "$DB_HOST" != "127.0.0.1" ]; then
  echo "DATABASE_URL is not local. This script only sets up a local test database." >&2
  exit 1
fi

if ! pg_isready -q; then
  echo "Postgres is not running. Start it with:  brew services start postgresql@17" >&2
  exit 1
fi

if [ "${1:-}" = "--reset" ]; then
  echo "Dropping $DB_NAME ..."
  dropdb --if-exists "$DB_NAME"
fi

if ! psql -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  echo "Creating $DB_NAME ..."
  createdb "$DB_NAME"
fi

# Supabase-managed roles the RLS lockdown migration grants to. They do not exist
# in a vanilla Postgres, so create no-login equivalents to let the same
# migrations apply unchanged.
echo "Ensuring Supabase-equivalent roles exist ..."
psql -q -d "$DB_NAME" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres SUPERUSER LOGIN;
  END IF;
END $$;
GRANT ALL ON SCHEMA public TO postgres;
SQL

echo "Applying migrations ..."
npx prisma migrate deploy

# Several suites (cart inventory, search) attach fixtures to seeded categories and
# products. Without the seed they fail with "No categories found in seed" — which is
# how we discovered they had been silently reading the shared database.
echo "Seeding ..."
npx prisma db seed

echo "Test database ready: $DB_NAME"
