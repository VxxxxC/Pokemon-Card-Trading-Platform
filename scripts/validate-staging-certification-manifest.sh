#!/usr/bin/env bash
# Ensures staging-certification.sh run_step sequence matches the frozen manifest.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/scripts/staging-certification.manifest.json"
SCRIPT="$ROOT/scripts/staging-certification.sh"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing manifest: $MANIFEST" >&2
  exit 1
fi

if [[ ! -f "$SCRIPT" ]]; then
  echo "Missing script: $SCRIPT" >&2
  exit 1
fi

expected_file="$(mktemp)"
actual_file="$(mktemp)"
trap 'rm -f "$expected_file" "$actual_file"' EXIT

bun -e "
  const manifest = await Bun.file(process.argv[1]).json();
  for (const step of manifest.steps) {
    console.log(step.name);
  }
" "$MANIFEST" >"$expected_file"

awk -F'"' '/^run_step "/ { print $2 }' "$SCRIPT" >"$actual_file"

expected_count="$(wc -l <"$expected_file" | tr -d ' ')"
actual_count="$(wc -l <"$actual_file" | tr -d ' ')"

if [[ "$expected_count" != "$actual_count" ]]; then
  echo "=== Staging certification manifest DRIFT ===" >&2
  echo "Expected $expected_count run_step entries, found $actual_count." >&2
  echo "Bump scripts/staging-certification.manifest.json version if intentional." >&2
  exit 1
fi

if ! diff -u "$expected_file" "$actual_file" >/dev/null; then
  echo "=== Staging certification manifest DRIFT ===" >&2
  diff -u "$expected_file" "$actual_file" >&2 || true
  echo "Bump scripts/staging-certification.manifest.json version if intentional." >&2
  exit 1
fi

version="$(bun -e "console.log((await Bun.file(process.argv[1]).json()).version)" "$MANIFEST")"
echo "Staging certification manifest lock: OK · v${version} · steps=${expected_count}"
