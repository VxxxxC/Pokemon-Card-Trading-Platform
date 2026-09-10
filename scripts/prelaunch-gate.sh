#!/usr/bin/env bash
# Pre-H1/H2 release gate: Phase 1a (+ optional 1b when PRELAUNCH_RUN_1B=1).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash scripts/prelaunch-gate-1a.sh

if [[ "${PRELAUNCH_RUN_1B:-}" == "1" ]]; then
  bash scripts/prelaunch-gate-1b.sh
else
  echo ""
  echo "Phase 1b skipped. To run Stripe E2E after starting stripe:webhook:listen:"
  echo "  PRELAUNCH_RUN_1B=1 bun run test:prelaunch:gate"
  echo "  bun run test:prelaunch:gate:1b"
fi
