#!/usr/bin/env bash
# Phase 1b: Stripe checkout E2E — requires stripe:webhook:listen + STRIPE_WEBHOOK_SECRET.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

bash scripts/prelaunch-check-env.sh --with-stripe-e2e

if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  echo "=== Prelaunch gate Phase 1b: BLOCKED ===" >&2
  echo "STRIPE_WEBHOOK_SECRET is required." >&2
  echo "Run: bun run stripe:webhook:listen" >&2
  echo "Copy the whsec_... value into .env.local, then retry." >&2
  exit 1
fi

echo "=== Prelaunch gate Phase 1b (webhook E2E) ==="
echo "Ensure stripe listen forwards to your dev server (Playwright starts dev via webServer)."
echo ""

steps=(
  "bun run test:rewards:gate"
  "bun run test:e2e:moderation-stripe-smoke"
)

failed=0

for step in "${steps[@]}"; do
  echo ""
  echo ">> $step"
  if [[ "$step" == *"test:rewards:gate"* ]]; then
    export REWARDS_GATE=1
  fi
  if eval "$step"; then
    echo "   OK"
  else
    echo "   FAILED"
    failed=1
    break
  fi
done

echo ""
if [[ "$failed" -eq 0 ]]; then
  echo "=== Prelaunch gate Phase 1b: ALL PASSED ==="
  echo ""
  echo "Optional: staging I-H14"
  echo "  PLAYWRIGHT_BASE_URL=https://<staging-host> bun run test:e2e:moderation-stripe-smoke"
  echo ""
  echo "Partner manual QA: docs/dev/prelaunch-gate.md (H1 + H2)"
  exit 0
fi

echo "=== Prelaunch gate Phase 1b: FAILED ==="
exit 1
