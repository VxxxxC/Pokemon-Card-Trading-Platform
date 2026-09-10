#!/usr/bin/env bash
# Diagnostic preflight for merchant grading E2E env (discover + verify).
# Does not block merge by itself — use test:prelaunch:check-env for that.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

echo "=== Merchant grading E2E preflight ==="
echo ""
echo ">> bun run discover:merchant-grading-e2e"
bun run discover:merchant-grading-e2e || true
echo ""
echo ">> bun run verify:merchant-grading-e2e"
bun run verify:merchant-grading-e2e
