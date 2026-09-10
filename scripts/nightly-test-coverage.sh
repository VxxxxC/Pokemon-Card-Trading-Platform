#!/usr/bin/env bash
# Phase 1 nightly test coverage — serial L2 → L4 cron → L5 appendix-A → L1 → L3 on staging fixtures.
# SSOT: docs/dev/test-coverage-ssot.md §9
#
# Prerequisites: Supabase + E2E_* in .env.local or CI secrets (see check-nightly-env.sh).
# Does NOT require Stripe webhook listen or merchant-grading verify.
#
# Usage: bun run test:nightly:coverage
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/e2e-production-server.sh"

e2e_load_project_env

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"
export PRODUCTION_GATE=1
export E2E_SERVER_SKIP_BUILD=0

failed=0

cleanup() {
  e2e_stop_production_server
}
trap cleanup EXIT

run_step() {
  local name="$1"
  shift
  echo ""
  echo "=== $(date '+%H:%M:%S') $name ==="
  if "$@"; then
    echo ">>> PASS: $name"
  else
    echo ">>> FAIL: $name"
    failed=1
  fi
}

echo "=== Nightly test coverage START $(date '+%Y-%m-%d %H:%M:%S') ==="

run_step "check-nightly-env" bash scripts/check-nightly-env.sh
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "L2 platform integration" bun run test:integration:platform
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "L4 cron HTTP integration (TC-M01–M06)" bun run test:integration:cron-routes
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "L5 appendix-A integration (TC-M10–M25 · M30–M31 · M40–M42)" bun run test:integration:appendix-a
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "start production server for E2E" e2e_start_production_server
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "bootstrap L2 dynamic E2E env" bash scripts/bootstrap-e2e-l2-env.sh
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "L2 UI surface scan (p-ui-routes)" env PLAYWRIGHT_SKIP_WEBSERVER=1 bun run test:e2e:ui-l2
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "L1 P2 E2E (TC-E01–E03)" bun run test:e2e:nightly:p2
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "L6 member-trading E2E (TC-E08 · E11 · J-AUTH-01)" bun run test:e2e:nightly:member
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "L3a matrix E2E (TC-P05)" env REWARDS_GATE=1 bun run test:e2e:nightly:matrix
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "L3b rewards matrix integration (TC-N05)" bun run test:integration:rewards-matrix
if [[ "$failed" -ne 0 ]]; then exit 1; fi

echo ""
if [[ "$failed" -eq 0 ]]; then
  echo "=== Nightly test coverage PASS $(date '+%Y-%m-%d %H:%M:%S') ==="
else
  echo "=== Nightly test coverage FAIL $(date '+%Y-%m-%d %H:%M:%S') ==="
  exit 1
fi
