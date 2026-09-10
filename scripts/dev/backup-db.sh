#!/usr/bin/env bash
# Backup remote Supabase Postgres before staging wipes.
# Prefers pg_dump (install: brew install libpq && brew link --force libpq)
# Fallback: bunx supabase db dump (requires Docker Desktop).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/dev/db-env.sh"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
MODE="${1:-full}" # full | schema | data

mkdir -p "$BACKUP_DIR"

load_env

assert_nonempty() {
  local file="$1"
  if [[ ! -s "$file" ]]; then
    echo "ERROR: backup file is empty: $file" >&2
    rm -f "$file"
    return 1
  fi
}

dump_pg() {
  local pg_dump_bin="$1"
  local db_url="$2"
  local outfile="$3"
  shift 3
  "$pg_dump_bin" "$db_url" --no-owner --no-acl "$@" -f "$outfile"
  assert_nonempty "$outfile"
}

dump_supabase_cli() {
  local outfile="$1"
  shift
  local extra_flags=("$@")
  local db_url=""

  if db_url="$(resolve_db_url)"; then
    bunx supabase db dump --db-url "$db_url" "${extra_flags[@]}" -f "$outfile"
  else
    bunx supabase db dump --linked "${extra_flags[@]}" -f "$outfile"
  fi
  assert_nonempty "$outfile"
}

run_dump() {
  local outfile="$1"
  shift
  local pg_flags=("$@")

  if pg_dump_bin="$(find_pg_dump)"; then
    local db_url
    db_url="$(resolve_db_url)" || {
      echo "ERROR: set DATABASE_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL in .env.local" >&2
      exit 1
    }
    echo "    using: $pg_dump_bin"
    dump_pg "$pg_dump_bin" "$db_url" "$outfile" "${pg_flags[@]}"
    return 0
  fi

  echo "    pg_dump not found; trying supabase CLI (needs Docker)…"
  if [[ " ${pg_flags[*]} " == *" --schema-only "* ]]; then
    dump_supabase_cli "$outfile" --schema public,auth,storage
  elif [[ " ${pg_flags[*]} " == *" --data-only "* ]]; then
    dump_supabase_cli "$outfile" --data-only --use-copy --schema public
  else
    dump_supabase_cli "$outfile" --schema public,auth,storage
  fi
}

SCHEMA_FILE="$BACKUP_DIR/${STAMP}-schema.sql"
DATA_FILE="$BACKUP_DIR/${STAMP}-data.sql"
FULL_FILE="$BACKUP_DIR/${STAMP}-full.sql"

echo "==> DB backup → $BACKUP_DIR"
echo "    mode: $MODE"

case "$MODE" in
  schema)
    run_dump "$SCHEMA_FILE" --schema-only --schema=public --schema=auth --schema=storage
    echo "✅ Schema: $SCHEMA_FILE ($(wc -c <"$SCHEMA_FILE" | tr -d ' ') bytes)"
    ;;
  data)
    run_dump "$DATA_FILE" --data-only --schema=public
    echo "✅ Data: $DATA_FILE ($(wc -c <"$DATA_FILE" | tr -d ' ') bytes)"
    ;;
  full)
    run_dump "$FULL_FILE" --schema=public --schema=auth --schema=storage
    run_dump "$DATA_FILE" --data-only --schema=public
    echo "✅ Full: $FULL_FILE ($(wc -c <"$FULL_FILE" | tr -d ' ') bytes)"
    echo "✅ Data: $DATA_FILE ($(wc -c <"$DATA_FILE" | tr -d ' ') bytes)"
    ;;
  *)
    echo "Usage: bash scripts/dev/backup-db.sh [full|schema|data]" >&2
    exit 1
    ;;
esac

echo "Done. Files are gitignored under backups/"
