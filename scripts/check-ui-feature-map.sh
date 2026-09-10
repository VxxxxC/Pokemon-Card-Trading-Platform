#!/usr/bin/env bash
# Validates docs/dev/ui-feature-map.json against system-feature-registry routes.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec bun run scripts/validate-ui-feature-map.ts "$@"
