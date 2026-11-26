#!/usr/bin/env bash
# Staging database password rotation — the steps after the owner resets the
# password in the Supabase dashboard and edits .env.staging (runbook:
# docs/release/CREDENTIAL_ROTATION_STAGING_DB.md in the workspace repo).
#
#   scripts/rotate-staging-db-secret.sh check     # connectivity with .env.staging (prints ok / FAILED only)
#   scripts/rotate-staging-db-secret.sh push      # check, then add a new `database-url` secret version
#
# Never prints a URL or password. Values go to Secret Manager over stdin
# (`--data-file -`), never on a command line. Refuses anything but the staging
# project. Does NOT disable the old secret version and does NOT deploy: the
# running backend keeps the old version until the next rollout, so disabling it
# first would take staging down. The printed next steps do those in order.
set -euo pipefail
cd "$(dirname "$0")/.."
STAGING_REF="gjhxhmcsuhxcmrvtkggz"
PROJECT="vertical-express"
ENV_FILE=".env.staging"

get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
DB="$(get DATABASE_URL)"; DIRECT="$(get DIRECT_URL)"
for v in "$DB" "$DIRECT"; do
  case "$v" in postgres://*|postgresql://*) ;; *) echo "refusing: $ENV_FILE URLs are not postgresql:// URLs" >&2; exit 1 ;; esac
  case "$v" in *"postgres.$STAGING_REF:"*) ;; *) echo "refusing: $ENV_FILE does not point at staging ($STAGING_REF)" >&2; exit 1 ;; esac
done

check() {
  local label="$1" url="$2" out
  if out="$(PGCONNECT_TIMEOUT=10 psql "$url" -X -A -t -c "select 1" 2>/dev/null)" && [ "$out" = "1" ]; then
    echo "ok      $label"
  else
    echo "FAILED  $label (wrong password, not yet propagated, or network)"; return 1
  fi
}

check "DIRECT_URL (session pooler :5432)" "$DIRECT"
check "DATABASE_URL (transaction pooler :6543)" "${DB%%\?*}"

[ "${1:-check}" = "push" ] || exit 0

printf '%s' "$DB" | npx -y firebase-tools@latest apphosting:secrets:set database-url \
  --project "$PROJECT" --data-file - >/dev/null
echo "added a new version of secret database-url"
gcloud secrets versions list database-url --project "$PROJECT" --limit 3 \
  --format="table(name.basename():label=VERSION,state,createTime)" 2>/dev/null || true

cat <<EOF

Next, in order:
  1. Roll out so ve-staging reads the new version (clean tree at the staging commit):
       npx -y firebase-tools@latest deploy --only apphosting --project $PROJECT
  2. Verify: curl -s https://ve-staging--vertical-express.asia-southeast1.hosted.app/api/health   -> {"status":"ok"}
  3. Only then disable the previous version:
       gcloud secrets versions disable <previous-version> --secret=database-url --project $PROJECT
EOF
