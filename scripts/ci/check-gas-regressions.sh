#!/usr/bin/env bash
set -euo pipefail

baseline_snapshot=${1:-gas-snapshots/.gas-snapshot}
threshold_pct=${2:-3}

if [[ ! -f "$baseline_snapshot" ]]; then
  echo "Baseline gas snapshot not found at $baseline_snapshot" >&2
  exit 1
fi

tmp_snapshot="$(mktemp)"
trap 'rm -f "$tmp_snapshot"' EXIT

export FOUNDRY_PROFILE="${FOUNDRY_PROFILE:-gas}"
forge_match_default="${GAS_SNAPSHOT_MATCH:-CommitRevealGas}"
forge_args=(snapshot --snap "$tmp_snapshot")
if [[ -n "$forge_match_default" ]]; then
  forge_args+=(--match-contract "$forge_match_default")
fi
forge "${forge_args[@]}" >/dev/null

python3 - "$baseline_snapshot" "$tmp_snapshot" "$threshold_pct" <<'PY'
import sys

def load_snapshot(path):
    data = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if ':' not in line or '(gas:' not in line:
                raise SystemExit(f"Unrecognized snapshot line: {line}")
            identifier, rest = line.split(' (gas: ')
            gas = int(rest.rstrip(')'))
            data[identifier] = gas
    return data

baseline = load_snapshot(sys.argv[1])
current = load_snapshot(sys.argv[2])
threshold = float(sys.argv[3])

regressions = []
missing = []

for key, base_value in baseline.items():
    if key not in current:
        missing.append(key)
        continue
    new_value = current[key]
    if base_value <= 0:
        continue
    delta = new_value - base_value
    pct = (delta / base_value) * 100
    if pct > threshold:
        regressions.append((key, base_value, new_value, pct))

if missing:
    print('Gas snapshot missing entries:')
    for key in sorted(missing):
        print(f"  {key}")

if regressions:
    print('Gas regressions detected:')
    for key, base, new, pct in regressions:
        print(f"  {key}: {base} -> {new} (+{pct:.2f}%)")

if missing or regressions:
    sys.exit(1)

print('Gas OK')
PY
