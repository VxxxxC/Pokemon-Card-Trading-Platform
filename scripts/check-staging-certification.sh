#!/usr/bin/env bash
# Validates docs/dev/system-feature-registry.md progress for Staging.
#
# Modes:
#   (default)  F-M/C/A/S feature rows must be ☑ — prerequisite to run test:staging:certify
#   --strict   Also requires SC-FX-ALL + staging-certification SC-G*/SC-S* rows ☑
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEATURE_REGISTRY="$ROOT/docs/dev/system-feature-registry.md"
STAGING_MANIFEST="$ROOT/docs/dev/staging-certification.md"

STRICT=0
for arg in "$@"; do
  if [[ "$arg" == "--strict" ]]; then
    STRICT=1
  fi
done

fail=0

check_incomplete_rows() {
  local file="$1"
  local label="$2"
  local mode="$3"
  local incomplete
  incomplete="$(awk -v mode="$mode" '
    function is_row() {
      if (mode == "features") {
        return /^\| \*\*F-M-/ || /^\| \*\*F-C-/ || /^\| \*\*F-S-/ || /^\| \*\*F-A-/
      }
      if (mode == "sc_fx") {
        return /^\| \*\*SC-FX-/
      }
      if (mode == "sc_gates") {
        return /^\| \*\*SC-G/ || /^\| \*\*SC-S/
      }
      return 0
    }
    is_row() {
      n = split($0, a, "|")
      if (n >= 2) {
        progress = a[n-1]
        gsub(/^[ \t]+|[ \t]+$/, "", progress)
        if (progress == "☐" || progress == "◐") print $0
      }
    }
  ' "$file" || true)"

  if [[ -n "$incomplete" ]]; then
    echo "=== $label INCOMPLETE ==="
    echo "$incomplete"
    echo ""
    fail=1
  fi
}

if [[ ! -f "$FEATURE_REGISTRY" ]]; then
  echo "Missing $FEATURE_REGISTRY" >&2
  exit 1
fi

check_incomplete_rows "$FEATURE_REGISTRY" \
  "System Feature Registry (F-M/C/A/S features)" \
  "features"

if [[ "$STRICT" -eq 1 ]]; then
  check_incomplete_rows "$FEATURE_REGISTRY" \
    "System Feature Registry (SC-FX-ALL)" \
    "sc_fx"

  if [[ -f "$STAGING_MANIFEST" ]]; then
    check_incomplete_rows "$STAGING_MANIFEST" \
      "Staging gate rows (SC-G / SC-S in staging-certification §2.1/2.6)" \
      "sc_gates"
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  if [[ "$STRICT" -eq 1 ]]; then
    echo "Fix: complete tests/CI, update 進度 to ☑ in system-feature-registry.md and staging-certification.md"
    echo "See docs/dev/system-feature-registry.md §5 SC-FX-ALL"
  else
    echo "Fix: complete in-scope feature tests, update F-M/C/A/S 進度 to ☑ in system-feature-registry.md"
  fi
  exit 1
fi

if [[ "$STRICT" -eq 1 ]]; then
  echo "=== Staging checklist: features + gates all ☑ ==="
else
  echo "=== Staging checklist: all in-scope features (F-M/C/A/S) ☑ ==="
fi
exit 0
