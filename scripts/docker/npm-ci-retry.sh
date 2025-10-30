#!/bin/sh
set -eu

# Enable pipefail when supported (e.g., bash) to match original behavior.
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

# Ensure a lockfile is present before running npm ci, otherwise the command will
# abort with EUSAGE regardless of retry attempts.
if [ ! -f package-lock.json ] && [ ! -f npm-shrinkwrap.json ]; then
  echo "npm ci requires package-lock.json or npm-shrinkwrap.json" >&2
  exit 1
fi

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}

while [ "$attempt" -le "$max_attempts" ]; do
  rm -rf node_modules

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "Final npm ci attempt will use --force to bypass platform-only optional deps" >&2
    if npm ci --force "$@"; then
      exit 0
    fi
    echo "npm ci failed after ${max_attempts} attempts" >&2
    exit 1
  fi

  if npm ci "$@"; then
    exit 0
  fi

  attempt=$((attempt + 1))
  wait_time=$((base_delay * attempt))
  echo "npm ci failed, retrying in ${wait_time}s (attempt ${attempt}/${max_attempts})" >&2
  sleep "$wait_time"
done
