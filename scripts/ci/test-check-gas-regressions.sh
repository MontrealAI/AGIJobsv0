#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

baseline_snapshot="$workdir/baseline.snap"
new_snapshot="$workdir/new.snap"

cat <<'SNAP' > "$baseline_snapshot"
ExampleContract:testOne() (gas: 100)
ExampleContract:testTwo() (gas: 200)
SNAP

cat <<'SNAP' > "$new_snapshot"
ExampleContract:testOne() (gas: 100)
SNAP

set +e
output="$($repo_root/scripts/ci/check-gas-regressions.sh "$baseline_snapshot" "$new_snapshot" 2>&1)"
status=$?
set -e

if [[ $status -eq 0 ]]; then
  echo "check-gas-regressions.sh succeeded but should have failed" >&2
  echo "Output was:\n$output" >&2
  exit 1
fi

if ! grep -q "ExampleContract:testTwo()" <<< "$output"; then
  echo "Missing identifier ExampleContract:testTwo() in error output" >&2
  echo "Output was:\n$output" >&2
  exit 1
fi

echo "check-gas-regressions.sh correctly detected missing entry" >&2
