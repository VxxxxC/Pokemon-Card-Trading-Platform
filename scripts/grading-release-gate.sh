#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Grading release gate ==="
failed=0

if bun run test:integration:grading; then
  echo "   grading integration: OK"
else
  echo "   grading integration: FAILED"
  failed=1
fi

if [[ -n "${STRIPE_SECRET_KEY:-}" ]]; then
  echo ""
  echo ">> bun run test:integration:grading:stripe-smoke"
  if bun run test:integration:grading:stripe-smoke; then
    echo "   stripe smoke: OK"
  else
    echo "   stripe smoke: FAILED"
    failed=1
  fi

  echo ""
  echo ">> bun run test:integration:grading:pass-stripe-smoke"
  if bun run test:integration:grading:pass-stripe-smoke; then
    echo "   pass stripe smoke: OK"
  else
    echo "   pass stripe smoke: FAILED"
    failed=1
  fi
else
  echo "   stripe smoke: SKIPPED (STRIPE_SECRET_KEY unset)"
fi

echo ""
if [[ "$failed" -eq 0 ]]; then
  echo "=== Grading release gate: ALL PASSED ==="
  exit 0
fi

echo "=== Grading release gate: FAILED ==="
exit 1
