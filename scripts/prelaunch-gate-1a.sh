#!/usr/bin/env bash
# Phase 1a: no webhook — logic gates before H1/H2 manual QA.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash scripts/prelaunch-check-env.sh

steps=(
  "bunx tsc --noEmit"
  "bun run test:integration:grading"
  "bun run test:integration:grading:stripe-smoke"
  "bun run test:integration:grading:pass-stripe-smoke"
  "bun run test:moderation:gate:full"
  "bun run test:integration:fps-payout"
  "bun run test:integration:merchant-connect-payout"
  "bun run build:ci"
)

echo "=== Prelaunch gate Phase 1a (no webhook) ==="
failed=0

for step in "${steps[@]}"; do
  echo ""
  echo ">> $step"
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
  echo "=== Prelaunch gate Phase 1a: ALL PASSED ==="
  echo ""
  echo "Next: start webhook listener, then Phase 1b:"
  echo "  Terminal B: bun run stripe:webhook:listen"
  echo "  Copy whsec_... to STRIPE_WEBHOOK_SECRET, restart dev if running"
  echo "  Terminal A: PRELAUNCH_RUN_1B=1 bun run test:prelaunch:gate"
  echo "  Or: bun run test:prelaunch:gate:1b"
  exit 0
fi

echo "=== Prelaunch gate Phase 1a: FAILED ==="
exit 1
