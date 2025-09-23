#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

baseline_snapshot="$workdir/baseline.snap"

cat <<'SNAP' > "$baseline_snapshot"
ExampleContract:testOne() (gas: 100)
ExampleContract:testTwo() (gas: 200)
SNAP

cat <<'SH' > "$workdir/forge"
#!/usr/bin/env bash
set -euo pipefail

snap_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --snap)
      snap_file="$2"
      shift 2
      ;;
    *)
      shift 1
      ;;
  esac
done

if [[ -z "$snap_file" ]]; then
  echo "Missing --snap argument" >&2
  exit 1
fi

cat <<'SNAP' > "$snap_file"
ExampleContract:testOne() (gas: 100)
SNAP
SH
chmod +x "$workdir/forge"

PATH="$workdir:$PATH"

set +e
output="$($repo_root/scripts/ci/check-gas-regressions.sh "$baseline_snapshot" 5 2>&1)"
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
