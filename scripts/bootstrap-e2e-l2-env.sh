#!/usr/bin/env bash
# Export fresh E2E_LISTING_PRODUCT_ID / E2E_CHECKOUT_ORDER_ID (and related) for L2 UI scan.
# SSOT: docs/dev/ui-feature-map.md · seed: bun run seed:e2e-marketplace-listing
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/e2e-production-server.sh"
e2e_load_project_env

exported=0
while IFS= read -r line; do
  if [[ "$line" =~ ^E2E_[A-Z0-9_]+= ]]; then
    export "$line"
    exported=$((exported + 1))
  fi
done < <(bun run scripts/seed-e2e-marketplace-listing.ts 2>&1 | grep '^E2E_')

if [[ "$exported" -eq 0 ]]; then
  echo "bootstrap-e2e-l2-env: no E2E_* lines exported" >&2
  exit 1
fi

echo "bootstrap-e2e-l2-env: exported ${exported} E2E_* vars for L2 scan"
