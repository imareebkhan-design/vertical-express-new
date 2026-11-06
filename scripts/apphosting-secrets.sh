#!/usr/bin/env bash
# Create/refresh the Cloud Secret Manager entries `apphosting.yaml` refers to.
#
#   scripts/apphosting-secrets.sh <env-file-holding-the-DATABASE_URL-to-use>
#
# Values are read from local env files and piped straight to Secret Manager
# (`--data-file -`): nothing is printed, nothing is written to a command line
# where `ps` could see it. Only secret NAMES are echoed.
#
# Needs: the Blaze plan on the Firebase project, and `firebase login`.
#
# DATABASE_URL is deliberately an argument, not a default. Which database the
# test backend talks to is a decision (see docs/DEPLOY_FIREBASE.md §Database) and
# a script must not make it silently.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${1:?usage: $0 <env-file with DATABASE_URL>}"
LOCAL=".env.local"
GENERATED=".env.local.secrets"   # gitignored (.env*)
PROJECT="${FIREBASE_PROJECT:-vertical-express}"

get() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

put() { # name value
  [ -n "$2" ] || { echo "refusing to set empty secret $1" >&2; exit 1; }
  printf '%s' "$2" | npx -y firebase-tools@latest apphosting:secrets:set "$1" --project "$PROJECT" --data-file - >/dev/null
  echo "set  $1"
}

# Random secrets we own: Razorpay webhook secret (you paste the SAME value into the
# Razorpay dashboard) and the cron bearer secret (Cloud Scheduler sends it).
gen() { # ENVNAME
  local v; v="$(get "$GENERATED" "$1")"
  if [ -z "$v" ]; then
    v="$(openssl rand -hex 32)"
    printf '%s=%s\n' "$1" "$v" >> "$GENERATED"
    echo "generated $1 into $GENERATED (not printed)" >&2
  fi
  printf '%s' "$v"
}

DBV="$(get "$DB_FILE" DATABASE_URL)"
case "$DBV" in postgres://*|postgresql://*) ;; *) echo "refusing: DATABASE_URL in $DB_FILE is not a postgresql:// URL (placeholder?). Run scripts/staging-db.sh status first." >&2; exit 1 ;; esac
put database-url            "$DBV"
put firebase-client-email   "$(get "$LOCAL" FIREBASE_CLIENT_EMAIL)"
put firebase-private-key    "$(get "$LOCAL" FIREBASE_PRIVATE_KEY)"
put razorpay-key-secret     "$(get "$LOCAL" RAZORPAY_KEY_SECRET)"
put razorpay-webhook-secret "$(gen RAZORPAY_WEBHOOK_SECRET)"
put cron-secret             "$(gen CRON_SECRET)"

echo
echo "Next: after the backend exists, grant it access to each secret:"
echo "  for s in database-url firebase-client-email firebase-private-key razorpay-key-secret razorpay-webhook-secret cron-secret; do"
echo "    npx -y firebase-tools@latest apphosting:secrets:grantaccess \$s --backend ve-staging --project $PROJECT; done"
