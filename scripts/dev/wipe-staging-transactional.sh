#!/usr/bin/env bash
# Wipe staging transactional test data (catalog / templates / KYC preserved).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/dev/db-env.sh"
load_env

if [[ "${WIPE_CONFIRM:-}" != "1" ]]; then
  echo "Refusing to wipe without WIPE_CONFIRM=1" >&2
  echo "Run: WIPE_CONFIRM=1 bun run wipe:staging" >&2
  exit 1
fi

PSQL_BIN="$(find_psql)" || {
  echo "ERROR: psql not found (brew install libpq)" >&2
  exit 1
}

DB_URL="$(resolve_db_url)" || {
  echo "ERROR: could not resolve DB URL" >&2
  exit 1
}

PRESERVE_LISTING="${E2E_LISTING_ID:-}"
if [[ -n "$PRESERVE_LISTING" ]]; then
  echo "==> Preserving E2E listing: $PRESERVE_LISTING"
else
  echo "==> No E2E_LISTING_ID — deleting ALL listings"
fi

echo "==> Wiping transactional data…"
"$PSQL_BIN" "$DB_URL" \
  -v preserve_listing="${PRESERVE_LISTING}" \
  -f "$ROOT_DIR/scripts/dev/wipe-staging-transactional.sql"

echo "✅ Staging transactional wipe complete."
