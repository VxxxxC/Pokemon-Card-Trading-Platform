#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

steps=(
  "bash scripts/moderation-release-gate.sh"
  "bun run test:integration:moderation:pbt"
  "bun run test:moderation:mutation"
  "bun run seed:moderation-e2e"
  "MODERATION_GATE=1 bun run test:e2e:moderation-gate"
)

echo "=== Moderation release gate (full) ==="
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
  echo "=== Moderation release gate (full): ALL PASSED ==="
  exit 0
fi

echo "=== Moderation release gate (full): FAILED ==="
exit 1
