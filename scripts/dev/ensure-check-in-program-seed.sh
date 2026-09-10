#!/usr/bin/env bash
# Apply check_in_program singleton seed (idempotent). Uses DATABASE_URL / SUPABASE_DB_* from .env.local.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source scripts/dev/db-env.sh
load_env

PSQL="$(find_psql || true)"
if [[ -z "$PSQL" ]]; then
  echo "psql not found (install libpq)" >&2
  exit 1
fi

DB_URL="$(resolve_db_url || true)"
if [[ -z "$DB_URL" ]]; then
  echo "Missing DATABASE_URL, SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD in .env.local" >&2
  exit 1
fi

SQL_FILE="$ROOT/supabase/migrations/20260928160000_ensure_check_in_program_seed.sql"
echo "=== ensure check_in_program seed ==="
"$PSQL" "$DB_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "=== done ==="
