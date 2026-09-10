#!/usr/bin/env bash
# Validates docs/dev/partner-regression.md — P-A/B/C and SC-P* rollup rows.
#
# Usage:
#   bash scripts/check-partner-regression.sh           # summary only (exit 0)
#   bash scripts/check-partner-regression.sh --p0      # fail if any P-A* or SC-P0 incomplete
#   bash scripts/check-partner-regression.sh --all     # fail if SC-P-ALL incomplete
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARTNER_SSOT="$ROOT/docs/dev/partner-regression.md"

STRICT_P0=0
STRICT_ALL=0
for arg in "$@"; do
  case "$arg" in
    --p0) STRICT_P0=1 ;;
    --all) STRICT_ALL=1 ;;
  esac
done

if [[ ! -f "$PARTNER_SSOT" ]]; then
  echo "Missing $PARTNER_SSOT" >&2
  exit 1
fi

fail=0

count_incomplete_prefix() {
  local prefix="$1"
  awk -v p="$prefix" '
    index($0, p) == 1 {
      n = split($0, a, "|")
      if (n >= 2) {
        progress = a[n-1]
        gsub(/^[ \t]+|[ \t]+$/, "", progress)
        if (progress == "☐" || progress == "◐") c++
      }
    }
    END { print c + 0 }
  ' "$PARTNER_SSOT"
}

check_incomplete_prefix() {
  local prefix="$1"
  local label="$2"
  local incomplete
  incomplete="$(awk -v p="$prefix" '
    index($0, p) == 1 {
      n = split($0, a, "|")
      if (n >= 2) {
        progress = a[n-1]
        gsub(/^[ \t]+|[ \t]+$/, "", progress)
        if (progress == "☐" || progress == "◐") print $0
      }
    }
  ' "$PARTNER_SSOT" || true)"

  if [[ -n "$incomplete" ]]; then
    echo "=== $label INCOMPLETE ==="
    echo "$incomplete"
    echo ""
    fail=1
  fi
}

p0_inc="$(count_incomplete_prefix "| **P-A0")"
p1_inc="$(count_incomplete_prefix "| **P-B0")"
p2_inc="$(count_incomplete_prefix "| **P-C0")"

echo "Partner regression SSOT: P0 incomplete=$p0_inc · P1=$p1_inc · P2=$p2_inc"

if [[ "$STRICT_P0" -eq 1 ]]; then
  check_incomplete_prefix "| **P-A0" "Partner P0 (P-A01–P-A08)"
  check_incomplete_prefix "| **SC-P0**" "Partner rollup SC-P0"
fi

if [[ "$STRICT_ALL" -eq 1 ]]; then
  check_incomplete_prefix "| **SC-P-ALL**" "Partner rollup SC-P-ALL"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "Partner regression SSOT incomplete. See docs/dev/partner-regression.md" >&2
  exit 1
fi

echo "Partner regression SSOT check: OK"
