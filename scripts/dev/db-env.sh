#!/usr/bin/env bash
# Shared DB connection helpers for backup / wipe scripts.
load_env() {
  if [[ -f .env.local ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
  elif [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
}

resolve_project_ref() {
  if [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
    printf '%s' "$SUPABASE_PROJECT_REF"
    return 0
  fi
  if [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
    local ref
    ref="$(printf '%s' "$NEXT_PUBLIC_SUPABASE_URL" | sed -n 's#https://\([^.]*\)\.supabase\.co.*#\1#p')"
    if [[ -n "$ref" ]]; then
      printf '%s' "$ref"
      return 0
    fi
  fi
  return 1
}

resolve_db_region() {
  if [[ -n "${SUPABASE_DB_REGION:-}" ]]; then
    printf '%s' "$SUPABASE_DB_REGION"
    return 0
  fi
  local ref
  ref="$(resolve_project_ref)" || return 1
  local region
  region="$(
    bunx supabase projects list 2>/dev/null \
      | sed -n 's/.*"ref":"'"$ref"'".*"region":"\([^"]*\)".*/\1/p' \
      | head -1
  )"
  if [[ -n "$region" ]]; then
    printf '%s' "$region"
    return 0
  fi
  printf 'ap-northeast-2'
}

resolve_db_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    printf '%s' "$DATABASE_URL"
    return 0
  fi
  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    printf '%s' "$SUPABASE_DB_URL"
    return 0
  fi
  if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    local ref region pooler_host
    ref="$(resolve_project_ref)" || return 1
    region="$(resolve_db_region)"
    pooler_host="${SUPABASE_POOLER_HOST:-aws-1-${region}.pooler.supabase.com}"
    printf 'postgresql://postgres.%s:%s@%s:5432/postgres' \
      "$ref" "$SUPABASE_DB_PASSWORD" "$pooler_host"
    return 0
  fi
  return 1
}

find_psql() {
  if command -v psql >/dev/null 2>&1; then
    command -v psql
    return 0
  fi
  if [[ -x /usr/local/opt/libpq/bin/psql ]]; then
    printf '/usr/local/opt/libpq/bin/psql'
    return 0
  fi
  if [[ -x /opt/homebrew/opt/libpq/bin/psql ]]; then
    printf '/opt/homebrew/opt/libpq/bin/psql'
    return 0
  fi
  return 1
}

find_pg_dump() {
  if command -v pg_dump >/dev/null 2>&1; then
    command -v pg_dump
    return 0
  fi
  if [[ -x /usr/local/opt/libpq/bin/pg_dump ]]; then
    printf '/usr/local/opt/libpq/bin/pg_dump'
    return 0
  fi
  if [[ -x /opt/homebrew/opt/libpq/bin/pg_dump ]]; then
    printf '/opt/homebrew/opt/libpq/bin/pg_dump'
    return 0
  fi
  return 1
}
