#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Partner regression preflight $(date '+%Y-%m-%d %H:%M:%S') ==="
bun run test:ui:check-map
bun run test:ui:check-data-contracts
bun run test:ui:audit-journeys
bun run scripts/validate-partner-ui-coverage.ts

echo "=== Partner regression E2E START $(date '+%Y-%m-%d %H:%M:%S') ==="
bun run test:e2e:partner
echo "=== Partner regression E2E PASS $(date '+%Y-%m-%d %H:%M:%S') ==="
