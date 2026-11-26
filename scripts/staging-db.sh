#!/usr/bin/env bash
# Migrate / inspect the STAGING database — and refuse to touch any other.
#
#   scripts/staging-db.sh status    # prisma migrate status
#   scripts/staging-db.sh migrate   # prisma migrate deploy (applies pending migrations)
#
# Reads DATABASE_URL (pooled) and DIRECT_URL (direct/session, used by Prisma
# Migrate) from `.env.staging` — a gitignored file YOU create; see
# docs/DEPLOY_FIREBASE.md §Staging database. Nothing is printed except hosts.
#
# THE GUARD. Staging exists so tests can write freely. Migrating or seeding the
# real database by mistake is the one error this script must make impossible, so
# it compares the Supabase project ref in the staging URLs against the ref of the
# production database (from `.env` and `supabase/config.toml`) and stops if they
# match, or if the staging URLs are not for one and the same project.
set -euo pipefail
cd "$(dirname "$0")/.."

CMD="${1:-status}"
STG=".env.staging"
[ -f "$STG" ] || { echo "Missing $STG — see docs/DEPLOY_FIREBASE.md §Staging database." >&2; exit 1; }

get() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
# The 20-letter Supabase project ref appears in the pooler username (postgres.<ref>) or host (db.<ref>.supabase.co).
# Parsing NEVER echoes the input: a malformed URL must not put a password in the terminal.
ref() { node -e 'try{const u=new URL(process.argv[1]);const m=(decodeURIComponent(u.username)+" "+u.hostname).match(/[a-z]{20}/);console.log(m?m[0]:"")}catch{console.log("")}' "$1" 2>/dev/null; }
host() { node -e 'try{console.log(new URL(process.argv[1]).hostname)}catch{console.log("")}' "$1" 2>/dev/null; }
is_pg_url() { node -e 'try{const u=new URL(process.argv[1]);process.exit(/^postgres(ql)?:$/.test(u.protocol)&&u.hostname&&u.username&&u.password?0:1)}catch{process.exit(1)}' "$1" 2>/dev/null; }

S_DB="$(get "$STG" DATABASE_URL)"; S_DIRECT="$(get "$STG" DIRECT_URL)"
[ -n "$S_DB" ] && [ -n "$S_DIRECT" ] || { echo "$STG must define DATABASE_URL and DIRECT_URL." >&2; exit 1; }

# Template text left in place of real values (angle brackets, [YOUR-PASSWORD]) is refused by name, not echoed.
for V in "$S_DB" "$S_DIRECT"; do
  case "$V" in *"<"*|*">"*|*"[YOUR"*|*"YOUR-PASSWORD"*) echo "REFUSING: $STG still contains placeholder text — replace it with the real staging connection strings." >&2; exit 1 ;; esac
  is_pg_url "$V" || { echo "REFUSING: DATABASE_URL and DIRECT_URL in $STG must each be a postgresql:// URL with a user and password (value not shown)." >&2; exit 1; }
done

S_REF="$(ref "$S_DB")"; D_REF="$(ref "$S_DIRECT")"
P_REF_ENV="$(ref "$(get .env DATABASE_URL)" 2>/dev/null || true)"
P_REF_CFG="$(grep -E '^project_id' supabase/config.toml 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"

if [ -z "$S_REF" ] || [ "$S_REF" != "$D_REF" ]; then
  echo "REFUSING: DATABASE_URL and DIRECT_URL in $STG must belong to the same Supabase project." >&2; exit 1
fi
for P in "$P_REF_ENV" "$P_REF_CFG"; do
  if [ -n "$P" ] && [ "$S_REF" = "$P" ]; then
    echo "REFUSING: $STG points at the PRODUCTION Supabase project ($S_REF). Staging must be a separate project." >&2; exit 1
  fi
done

echo "staging project ref: $S_REF  (pooled host: $(host "$S_DB"))"
export DATABASE_URL="$S_DB" DIRECT_URL="$S_DIRECT"

case "$CMD" in
  status)  npx prisma migrate status ;;
  migrate) npx prisma migrate deploy && npx prisma migrate status ;;
  *) echo "usage: $0 [status|migrate]" >&2; exit 1 ;;
esac
