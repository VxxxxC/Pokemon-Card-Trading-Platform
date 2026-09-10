#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash scripts/prelaunch-check-env.sh

steps=(
  "bunx tsc --noEmit"
  "bun run lint"
  "bun run test:integration:fps-payout"
  "bun run build:ci"
)

echo "=== FPS payout release gate ==="
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
  echo "=== FPS payout release gate: ALL PASSED ==="
  exit 0
fi

echo "=== FPS payout release gate: FAILED ==="
exit 1
