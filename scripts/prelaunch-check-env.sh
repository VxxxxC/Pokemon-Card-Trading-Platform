#!/usr/bin/env bash
# Phase 0: validate env before prelaunch gate (H1/H2 manual QA).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

require_phase1a=1
require_phase1b=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-stripe-e2e)
      require_phase1b=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

missing=()

check_set() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    missing+=("$key")
  fi
}

# Load .env.local if present (do not override existing exports)
if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

check_set NEXT_PUBLIC_SUPABASE_URL
check_set NEXT_PUBLIC_SUPABASE_ANON_KEY
check_set SUPABASE_SERVICE_ROLE_KEY
check_set E2E_ADMIN_EMAIL
check_set E2E_ADMIN_PASSWORD
check_set E2E_BUYER_EMAIL
check_set E2E_BUYER_PASSWORD
check_set E2E_SELLER_EMAIL
check_set E2E_SELLER_PASSWORD
check_set E2E_SELLER_ID
check_set E2E_LISTING_ID

if [[ "$require_phase1b" -eq 1 ]]; then
  check_set STRIPE_SECRET_KEY
  check_set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  check_set STRIPE_WEBHOOK_SECRET
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "=== Prelaunch env check: FAILED ===" >&2
  echo "Missing required variables:" >&2
  for key in "${missing[@]}"; do
    echo "  - $key" >&2
  done
  echo "" >&2
  echo "See docs/dev/prelaunch-gate.md (Phase 0)." >&2
  exit 1
fi

echo "=== Prelaunch env check: OK ==="
if [[ "$require_phase1b" -eq 1 ]]; then
  echo "Phase 1b Stripe E2E vars present."
else
  echo "Phase 1a vars present. For Phase 1b, re-run with --with-stripe-e2e after stripe:webhook:listen."
fi

echo ""
echo ">> bun run verify:merchant-grading-e2e"
if ! bun run verify:merchant-grading-e2e; then
  echo "=== Prelaunch env check: FAILED (merchant grading E2E alignment) ===" >&2
  echo "" >&2
  echo ">> bun run discover:merchant-grading-e2e (diagnostics)" >&2
  bun run discover:merchant-grading-e2e || true
  echo "" >&2
  echo "Fix env per nextSteps above, then re-run: bun run test:prelaunch:check-env" >&2
  exit 1
fi
