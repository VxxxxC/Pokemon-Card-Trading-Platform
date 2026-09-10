#!/usr/bin/env bash
# Preflight before test:staging:certify — runs fast/medium steps + env checks for heavy steps.
# Requires >=95% weighted pass rate (see staging-certification.manifest.json).
#
# Usage:
#   bun run test:staging:certify:preflight
#   bun run test:staging:certify:preflight -- --min-pass-rate 0.95
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MIN_PASS_RATE="0.95"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --min-pass-rate)
      MIN_PASS_RATE="${2:-0.95}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

MANIFEST="$ROOT/scripts/staging-certification.manifest.json"
passed_weight=0
total_weight=0
failed_steps=()

weight_for_tier() {
  case "$1" in
    fast) echo 2 ;;
    medium) echo 2 ;;
    heavy) echo 1 ;;
    *) echo 1 ;;
  esac
}

record_result() {
  local name="$1"
  local tier="$2"
  local ok="$3"
  local weight
  weight="$(weight_for_tier "$tier")"
  total_weight=$((total_weight + weight))
  if [[ "$ok" -eq 1 ]]; then
    passed_weight=$((passed_weight + weight))
    echo ">>> PREFLIGHT PASS ($tier): $name"
  else
    failed_steps+=("$name")
    echo ">>> PREFLIGHT FAIL ($tier): $name" >&2
  fi
}

run_exec_step() {
  local name="$1"
  local tier="$2"
  shift 2
  if "$@"; then
    record_result "$name" "$tier" 1
  else
    record_result "$name" "$tier" 0
  fi
}

echo "=== Staging Certify Preflight START $(date '+%Y-%m-%d %H:%M:%S') ==="

bash scripts/validate-staging-certification-manifest.sh

run_exec_step "ssot feature checklist" fast bash scripts/check-staging-certification.sh

heavy_env_ok=0
if bash scripts/check-staging-certify-env.sh; then
  heavy_env_ok=1
fi

manifest_steps_file="$(mktemp)"
trap 'rm -f "$manifest_steps_file"' EXIT
bun -e "
  const manifest = await Bun.file(process.argv[1]).json();
  for (const step of manifest.steps) {
    console.log([step.id, step.name, step.tier, step.command].join('\t'));
  }
" "$MANIFEST" >"$manifest_steps_file"

while IFS=$'\t' read -r _step_id step_name step_tier step_command; do
  [[ -z "$step_name" ]] && continue

  if [[ "$step_tier" == "heavy" ]]; then
    record_result "$step_name (env-ready)" "$step_tier" "$heavy_env_ok"
    continue
  fi

  run_exec_step "$step_name" "$step_tier" bash -lc "$step_command"
done <"$manifest_steps_file"

if [[ "$total_weight" -le 0 ]]; then
  echo "Preflight scoring error: total_weight=0" >&2
  exit 1
fi

pass_rate="$(echo "$passed_weight $total_weight" | awk '{ printf "%.4f", $1 / $2 }')"
pass_pct="$(echo "$pass_rate" | awk '{ printf "%.1f", $1 * 100 }')"
min_pct="$(echo "$MIN_PASS_RATE" | awk '{ printf "%.1f", $1 * 100 }')"

echo ""
echo "=== Preflight score: ${passed_weight}/${total_weight} (${pass_pct}%) · required >= ${min_pct}% ==="

if [[ ${#failed_steps[@]} -gt 0 ]]; then
  echo "Failed steps:"
  for step in "${failed_steps[@]}"; do
    echo "  - $step"
  done
fi

awk -v rate="$pass_rate" -v min="$MIN_PASS_RATE" 'BEGIN { if (rate + 0.00001 >= min) exit 0; exit 1 }' || {
  echo "=== Staging Certify Preflight FAIL $(date '+%Y-%m-%d %H:%M:%S') ===" >&2
  echo "Fix failures above before bun run test:staging:certify" >&2
  exit 1
}

echo "=== Staging Certify Preflight PASS $(date '+%Y-%m-%d %H:%M:%S') ==="
echo "Safe to run: bun run test:staging:certify"
echo "Note: P-F04B settlement E2E skips unless E2E_SELLER profiles.role = merchant."
