#!/usr/bin/env bash
# Shared production Next.js server lifecycle for Playwright E2E (nightly / staging certify).
set -euo pipefail

E2E_SERVER_PID_FILE="${E2E_SERVER_PID_FILE:-/tmp/hkcv-e2e-prod-server.pid}"
E2E_SERVER_SKIP_BUILD="${E2E_SERVER_SKIP_BUILD:-0}"

# Load .env then .env.local (later files override). Next inlines NEXT_PUBLIC_* at build time —
# after `build:ci` (empty Supabase env) we must run `bun run build` before Playwright E2E.
e2e_load_project_env() {
  for env_file in .env .env.local; do
    if [[ -f "$env_file" ]]; then
      set -a
      # shellcheck disable=SC1091
      source "$env_file"
      set +a
    fi
  done
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-90}"
  for _ in $(seq 1 "$attempts"); do
    if curl -m 3 -s -o /dev/null -w "%{http_code}" "$url" | grep -qE '^[23]'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

e2e_stop_production_server() {
  local pid=""
  if [[ -f "$E2E_SERVER_PID_FILE" ]]; then
    pid="$(cat "$E2E_SERVER_PID_FILE" 2>/dev/null || true)"
    rm -f "$E2E_SERVER_PID_FILE"
  fi
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi

  local pid_on_port
  pid_on_port="$(lsof -t -i:3000 2>/dev/null || true)"
  if [[ -n "$pid_on_port" ]]; then
    kill "$pid_on_port" 2>/dev/null || true
    sleep 1
  fi
}

e2e_start_production_server() {
  local base_url="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"

  e2e_stop_production_server
  e2e_load_project_env

  if [[ "${PRODUCTION_GATE:-}" == "1" ]]; then
    if [[ "$E2E_SERVER_SKIP_BUILD" == "1" ]]; then
      echo ">> PRODUCTION_GATE=1: ignoring E2E_SERVER_SKIP_BUILD (rebuild after build:ci)"
    fi
    E2E_SERVER_SKIP_BUILD=0
  fi

  if [[ "$E2E_SERVER_SKIP_BUILD" != "1" ]]; then
    echo ">> bun run build (production bundle for E2E — not build:ci)"
    bun run build
  else
    echo ">> skipping build (E2E_SERVER_SKIP_BUILD=1; only safe after bun run build with real env)"
  fi

  bun run start &
  local server_pid=$!
  echo "$server_pid" >"$E2E_SERVER_PID_FILE"
  export PLAYWRIGHT_SKIP_WEBSERVER=1

  if ! wait_for_http "$base_url/"; then
    echo "Production server did not become ready at $base_url" >&2
    e2e_stop_production_server
    return 1
  fi

  echo "Production server ready (pid $server_pid) at $base_url"
}
