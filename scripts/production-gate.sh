#!/usr/bin/env bash
# Merge Full v2 — Production Gate (Stripe Test mode / sandbox OK).
# SSOT: docs/dev/PRODUCTION_GATE.md §2
#
# Prerequisites:
#   - .env.local with Supabase + E2E fixtures (see prelaunch-check-env)
#   - STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (Test mode)
#   - For I-H14 only: run `bun run stripe:webhook:listen` in another terminal
#     forwarding to PLAYWRIGHT_BASE_URL (default http://localhost:3000).
#     C1 webhook-route integration (when added) does NOT need listen.
#
# Modes:
#   bun run test:production:gate          — infra/dev; C1/admin-grading may SKIP if files missing
#   bun run test:production:gate:signoff  — formal sign-off; C1 + admin-grading + mutation required
#
# Rewards E2E excludes platform-rewards-matrix (PG-CPN-08 Flaky) unless:
#   PRODUCTION_GATE_INCLUDE_MATRIX=1
#
# Estimated runtime: 120–150 min (integration + E2E + mutation).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"
export PRODUCTION_GATE=1

SIGNOFF="${PRODUCTION_GATE_SIGNOFF:-0}"
C1_TEST="tests/integration/stripe/webhook-route.integration.test.ts"
ADMIN_E2E="e2e/admin-grading.spec.ts"

SERVER_PID=""
failed=0

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
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

require_file_or_skip() {
  local label="$1"
  local path="$2"
  shift 2
  if [[ -f "$path" ]]; then
    run_step "$label" "$@"
    return 0
  fi
  if [[ "$SIGNOFF" == "1" ]]; then
    echo ""
    echo ">>> FAIL: $label required for sign-off (missing $path)" >&2
    failed=1
    return 1
  fi
  echo ""
  echo ">>> SKIP: $path — pending (set PRODUCTION_GATE_SIGNOFF=1 only after PR-B/C)"
  return 0
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

start_production_server() {
  local pid_on_port
  pid_on_port="$(lsof -t -i:3000 2>/dev/null || true)"
  if [[ -n "$pid_on_port" ]]; then
    echo "Stopping existing process on :3000 (pid $pid_on_port)"
    kill "$pid_on_port" 2>/dev/null || true
    sleep 2
  fi

  echo ">> bun run build (production bundle for E2E — not build:ci)"
  bun run build

  bun run start &
  SERVER_PID=$!
  export PLAYWRIGHT_SKIP_WEBSERVER=1

  if ! wait_for_http "$PLAYWRIGHT_BASE_URL/"; then
    echo "Production server did not become ready at $PLAYWRIGHT_BASE_URL" >&2
    return 1
  fi
  echo "Production server ready (pid $SERVER_PID)"
}

echo "=== Merge Full v2 (Production Gate) START $(date '+%Y-%m-%d %H:%M:%S') ==="
if [[ "$SIGNOFF" == "1" ]]; then
  echo ">>> Mode: SIGN-OFF (C1 + admin-grading + mutation required)"
else
  echo ">>> Mode: infra/dev (pending PR-B/C may SKIP)"
fi

# Phase 0 — env (Stripe Test mode keys + webhook secret for I-H14)
run_step "prelaunch-check-env (with Stripe E2E)" \
  bash scripts/prelaunch-check-env.sh --with-stripe-e2e
if [[ "$failed" -ne 0 ]]; then exit 1; fi

# Phase 1 — PR Fast (~20–25 min). tsc runs inside moderation-release-gate only (no duplicate).
run_step "lint" bun run lint
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "build:ci (empty Supabase env — CI prerender guard)" bun run build:ci
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "moderation-release-gate (tsc + integration moderation/grading + unit)" \
  bash scripts/moderation-release-gate.sh
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "integration:rewards" bun run test:integration:rewards
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "integration:moderation:pbt" bun run test:integration:moderation:pbt
if [[ "$failed" -ne 0 ]]; then exit 1; fi

# Phase 2 — Merge integration (~35–50 min)
run_step "verify:merchant-grading-e2e" bun run verify:merchant-grading-e2e
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "integration:grading:stripe-smoke" bun run test:integration:grading:stripe-smoke
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "integration:grading:pass-stripe-smoke" \
  bun run test:integration:grading:pass-stripe-smoke
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "integration:fps-payout" bun run test:integration:fps-payout
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "integration:merchant-connect-payout" \
  bun run test:integration:merchant-connect-payout
if [[ "$failed" -ne 0 ]]; then exit 1; fi

# Phase 3 — E2E on next start (~50–65 min)
run_step "start production server for E2E" start_production_server
if [[ "$failed" -ne 0 ]]; then exit 1; fi

# C1 (PR-B): after server up — supports HTTP POST to /api/stripe/webhook or in-process handler
require_file_or_skip "integration:stripe:webhook-route (C1)" "$C1_TEST" \
  bun run test:integration:stripe:webhook-route
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "seed:moderation-e2e" bun run seed:moderation-e2e
if [[ "$failed" -ne 0 ]]; then exit 1; fi

if [[ "${PRODUCTION_GATE_INCLUDE_MATRIX:-}" == "1" ]]; then
  echo ""
  echo ">>> Rewards E2E: full gate (includes platform-rewards-matrix / PG-CPN-08)"
  run_step "rewards E2E gate (with matrix)" env REWARDS_GATE=1 bun run test:e2e:rewards-gate
else
  echo ""
  echo ">>> Rewards E2E: production subset (excludes matrix — PG-CPN-08 Flaky; v2.1)"
  run_step "rewards E2E gate (production)" env REWARDS_GATE=1 bun run test:e2e:rewards-gate:production
fi
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "moderation E2E gate" env MODERATION_GATE=1 bun run test:e2e:moderation-gate
if [[ "$failed" -ne 0 ]]; then exit 1; fi

run_step "partial smoke E2E (M4/M5)" bun run test:e2e:smoke-partial
if [[ "$failed" -ne 0 ]]; then exit 1; fi

echo ""
echo "=== I-H14 requires stripe listen → $PLAYWRIGHT_BASE_URL/api/stripe/webhook ==="
echo "    (C1 route integration does not use listen; this step does.)"
if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  echo ">>> FAIL: STRIPE_WEBHOOK_SECRET unset — start stripe:webhook:listen first" >&2
  failed=1
else
  run_step "moderation-stripe-smoke E2E (I-H14)" bun run test:e2e:moderation-stripe-smoke
fi
if [[ "$failed" -ne 0 ]]; then exit 1; fi

require_file_or_skip "admin grading E2E smoke" "$ADMIN_E2E" \
  bun run test:e2e:admin-grading
if [[ "$failed" -ne 0 ]]; then exit 1; fi

if [[ "$SIGNOFF" == "1" && "${PRODUCTION_GATE_SKIP_MUTATION:-}" == "1" ]]; then
  echo ""
  echo ">>> FAIL: mutation cannot be skipped in sign-off mode" >&2
  failed=1
elif [[ "${PRODUCTION_GATE_SKIP_MUTATION:-}" == "1" ]]; then
  echo ""
  echo ">>> SKIP: moderation:mutation (PRODUCTION_GATE_SKIP_MUTATION=1)"
else
  run_step "moderation:mutation" bun run test:moderation:mutation
fi

echo ""
if [[ "$failed" -eq 0 ]]; then
  echo "=== Merge Full v2: ALL PASSED $(date '+%Y-%m-%d %H:%M:%S') ==="
  exit 0
fi

echo "=== Merge Full v2: FAILED ==="
exit 1
