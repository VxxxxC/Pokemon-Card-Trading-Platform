#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

steps=(
  "bun run test:integration:rewards"
  "bun run test:e2e:auth-escrow"
)

echo "=== Auth Escrow release gate ==="
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
  echo "=== Auth Escrow release gate: ALL PASSED ==="
  exit 0
fi

echo "=== Auth Escrow release gate: FAILED ==="
exit 1
