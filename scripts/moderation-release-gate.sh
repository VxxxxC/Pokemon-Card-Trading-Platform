#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

steps=(
  "bunx tsc --noEmit"
  "bun run test:integration:moderation"
  "bun run test:integration:grading"
  "bunx vitest run --config vitest.config.mts tests/unit/moderation"
)

echo "=== Moderation release gate (fast) ==="
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
  echo "=== Moderation release gate (fast): ALL PASSED ==="
  exit 0
fi

echo "=== Moderation release gate (fast): FAILED ==="
exit 1
