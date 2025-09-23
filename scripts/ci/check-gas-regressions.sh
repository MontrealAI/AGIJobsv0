#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <baseline-snapshot> <new-snapshot>" >&2
  exit 1
fi

baseline_snapshot_path=$1
new_snapshot_path=$2

declare -A baseline_snapshot
declare -A new_snapshot

parse_snapshot() {
  local snapshot_path=$1
  local -n snapshot_map=$2

  while IFS= read -r line || [[ -n $line ]]; do
    [[ -z ${line//[[:space:]]/} ]] && continue

    if [[ $line =~ ^(.+)\ \(gas:\ ([0-9]+)\)$ ]]; then
      local identifier=${BASH_REMATCH[1]}
      local gas_value=${BASH_REMATCH[2]}
      snapshot_map["$identifier"]=$gas_value
    else
      echo "Unrecognized snapshot line: $line" >&2
      exit 1
    fi
  done < "$snapshot_path"
}

parse_snapshot "$baseline_snapshot_path" baseline_snapshot
parse_snapshot "$new_snapshot_path" new_snapshot

regression_found=0

for identifier in "${!baseline_snapshot[@]}"; do
  if [[ -z ${new_snapshot[$identifier]+x} ]]; then
    echo "Gas snapshot missing test '$identifier' in new snapshot" >&2
    regression_found=1
  fi
done

for identifier in "${!new_snapshot[@]}"; do
  if [[ -z ${baseline_snapshot[$identifier]+x} ]]; then
    echo "New gas snapshot introduced '$identifier' with gas ${new_snapshot[$identifier]}" >&2
    continue
  fi

  old_value=${baseline_snapshot[$identifier]}
  new_value=${new_snapshot[$identifier]}

  if (( new_value > old_value )); then
    increase=$(( new_value - old_value ))
    echo "Gas regression for '$identifier': ${old_value} -> ${new_value} (+${increase})" >&2
    regression_found=1
  fi

done

exit $regression_found
