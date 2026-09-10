#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

steps=(
  "bun run test:integration:rewards"
  "bun run test:e2e:rewards-gate"
)

echo "=== Rewards release gate ==="
failed=0

for step in "${steps[@]}"; do
  echo ""
  echo ">> $step"
  if [[ "$step" == *"test:e2e:rewards-gate"* ]]; then
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
  echo "=== Rewards release gate: ALL PASSED ==="
  exit 0
fi

echo "=== Rewards release gate: FAILED ==="
exit 1
