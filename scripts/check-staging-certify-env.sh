#!/usr/bin/env bash
# Env readiness for staging-certification heavy steps (does not run long suites).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

check_label=""
check_fn() {
  local label="$1"
  shift
  check_label="$label"
  if "$@"; then
    echo ">>> ENV PASS: $label"
    return 0
  fi
  echo ">>> ENV FAIL: $label" >&2
  return 1
}

failed=0
record_fail() {
  failed=1
}

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

check_fn "nightly env" bash scripts/check-nightly-env.sh || record_fail

check_fn "production signoff env" bash scripts/prelaunch-check-env.sh --with-stripe-e2e || record_fail

check_fn "production server helpers" test -f scripts/e2e-production-server.sh || record_fail

check_fn "rewards E2E production gate npm script" bash -lc 'node -e "const p=require(\"./package.json\"); process.exit(p.scripts[\"test:e2e:rewards-gate:production\"] ? 0 : 1)"' || record_fail

check_fn "stryker rewards config" test -f stryker.config.json || record_fail

check_fn "stryker moderation config" test -f stryker.moderation.config.json || record_fail

if [[ "$failed" -ne 0 ]]; then
  echo "=== Staging certify env check: FAILED ===" >&2
  exit 1
fi

echo "=== Staging certify env check: OK ==="
