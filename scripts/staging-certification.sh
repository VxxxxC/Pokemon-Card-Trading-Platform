#!/usr/bin/env bash
# Full staging certification: SSOT §2 all ☑ + production signoff + nightly + security suites.
#
# FROZEN MANIFEST v1.0.0 — do NOT add/remove/reorder run_step lines without updating:
#   scripts/staging-certification.manifest.json
#   scripts/validate-staging-certification-manifest.sh
#
# Before full certify, run:
#   bun run test:staging:certify:preflight   # requires >=95% weighted pass
#
# Usage:
#   bun run test:staging:certify              # full
#   bun run test:staging:certify --check-ssot # manifest only
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CHECK_SSOT_ONLY=0
for arg in "$@"; do
  if [[ "$arg" == "--check-ssot" ]]; then
    CHECK_SSOT_ONLY=1
  fi
done

echo "=== Staging Certification START $(date '+%Y-%m-%d %H:%M:%S') ==="

if [[ "$CHECK_SSOT_ONLY" -eq 1 ]]; then
  bash scripts/check-staging-certification.sh --strict
  echo "=== --check-ssot only; skipping test suites ==="
  exit 0
fi

bash scripts/check-staging-certification.sh

bash scripts/validate-staging-certification-manifest.sh

# shellcheck disable=SC1091
source "$ROOT/scripts/e2e-production-server.sh"

e2e_load_project_env
export E2E_SERVER_SKIP_BUILD=0

cleanup_certify() {
  e2e_stop_production_server
}
trap cleanup_certify EXIT

failed=0
run_step() {
  local name="$1"
  shift
  echo ""
  echo "=== $name ==="
  if "$@"; then
    echo ">>> PASS: $name"
  else
    echo ">>> FAIL: $name"
    failed=1
  fi
}

run_step "ui feature map" bun run test:ui:check-map
run_step "ui data contracts" bash scripts/check-ui-data-contracts.sh
run_step "ui journey audit" bun run test:ui:audit-journeys
run_step "checkout pricing unit" bunx vitest run --config vitest.config.mts tests/unit/lib/checkout/compute-pricing.test.ts
run_step "production gate signoff" env PRODUCTION_GATE_SIGNOFF=1 bun run test:production:gate:signoff
run_step "nightly coverage" bun run test:nightly:coverage
run_step "rewards integration" bun run test:integration:rewards
run_step "start production server for rewards E2E" e2e_start_production_server
run_step "rewards E2E production gate" env REWARDS_GATE=1 bun run test:e2e:rewards-gate:production
run_step "partner checkout data contracts" bun run test:e2e:partner-data-contract
run_step "coupon security" bunx vitest run --config vitest.config.mts tests/integration/rewards/coupon-security.integration.test.ts
run_step "coupon pbt" bun run test:integration:rewards:pbt
run_step "moderation pbt" bun run test:integration:moderation:pbt
run_step "rewards mutation contract" bunx vitest run --config vitest.config.mts tests/unit/rewards/rewards-mutation-contract.test.ts
run_step "rewards mutation" bun run test:rewards:mutation
run_step "moderation mutation" bun run test:moderation:mutation

echo ""
if [[ "$failed" -eq 0 ]]; then
  echo "=== Staging Certification PASS $(date '+%Y-%m-%d %H:%M:%S') ==="
  echo "Next: deploy staging + Partner M0 (PARTNER_QA.md)"
else
  echo "=== Staging Certification FAIL $(date '+%Y-%m-%d %H:%M:%S') ==="
  exit 1
fi
