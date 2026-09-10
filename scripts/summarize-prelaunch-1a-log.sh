#!/usr/bin/env bash
# Parse prelaunch 1a background log into a step checklist.
# Usage: bash scripts/summarize-prelaunch-1a-log.sh [log_path]
set -euo pipefail

LOG="${1:-/tmp/prelaunch-1a.log}"

if [[ ! -f "$LOG" ]]; then
  echo "Log not found: $LOG" >&2
  exit 1
fi

echo "=== Prelaunch 1a log summary ==="
echo "Log: $LOG"
grep -E '^started_at=|^exit_code=|^finished_at=' "$LOG" 2>/dev/null || true
echo ""

# Only parse after Phase 1a header (ignore nested moderation gate duplicates)
SLICE=$(awk '/=== Prelaunch gate Phase 1a/{found=1} found' "$LOG")

status_for_step() {
  local step="$1"
  local block
  block=$(echo "$SLICE" | awk -v s="$step" '
    $0 ~ ">> .*" s { capture=1; block=""; next }
    capture && /^>> / { capture=0 }
    capture { block = block $0 "\n" }
    END { printf "%s", block }
  ')

  if [[ -z "$block" ]]; then
    if [[ "$step" == "verify:merchant-grading-e2e" ]] && grep -q '"ok":true' "$LOG"; then
      echo "PASS"
    else
      echo "PENDING"
    fi
    return
  fi

  if [[ "$step" == "verify:merchant-grading-e2e" ]]; then
    if echo "$block" | grep -q '"ok":true'; then echo "PASS"; else echo "FAIL"; fi
    return
  fi

  if echo "$block" | grep -q '   FAILED'; then
    echo "FAIL"
  elif echo "$block" | grep -q '   OK'; then
    echo "PASS"
  else
    echo "RUNNING_OR_UNKNOWN"
  fi
}

steps=(
  "verify:merchant-grading-e2e"
  "bunx tsc --noEmit"
  "test:integration:grading"
  "test:integration:grading:stripe-smoke"
  "test:integration:grading:pass-stripe-smoke"
  "test:moderation:gate:full"
  "test:integration:fps-payout"
  "test:integration:merchant-connect-payout"
  "build:ci"
)

for step in "${steps[@]}"; do
  st=$(status_for_step "$step")
  printf "  [%s] %s\n" "$st" "$step"
done

echo ""
if grep -q "=== Prelaunch gate Phase 1a: ALL PASSED ===" "$LOG"; then
  echo "Overall: ALL PASSED"
elif grep -q "=== Prelaunch gate Phase 1a: FAILED ===" "$LOG"; then
  echo "Overall: FAILED"
  echo ""
  echo "Last errors:"
  grep -E "FAIL |FAILED|Error:|error:" "$LOG" | tail -8
else
  echo "Overall: IN_PROGRESS (or log incomplete)"
fi

echo ""
echo "Checklist: docs/dev/prelaunch-1a-gap-checklist.md"
