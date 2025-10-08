#!/bin/sh
set -euo pipefail

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}

while [ "$attempt" -le "$max_attempts" ]; do
  rm -rf node_modules

  if npm ci "$@"; then
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "npm ci failed after ${max_attempts} attempts" >&2
    exit 1
  fi

  attempt=$((attempt + 1))
  wait_time=$((base_delay * attempt))
  echo "npm ci failed, retrying in ${wait_time}s (attempt ${attempt}/${max_attempts})" >&2
  sleep "$wait_time"
done
