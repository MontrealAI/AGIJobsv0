#!/bin/sh
set -eu

# When no lockfile is present, fall back to a standard install immediately.
if [ ! -f package-lock.json ]; then
  echo "package-lock.json not found; running npm install $*" >&2
  exec npm install "$@"
fi

# Enable pipefail when supported (e.g., bash) to match original behavior.
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}

while [ "$attempt" -le "$max_attempts" ]; do
  rm -rf node_modules

  if npm ci "$@"; then
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "npm ci failed after ${max_attempts} attempts; falling back to npm install" >&2
    break
  fi

  attempt=$((attempt + 1))
  wait_time=$((base_delay * attempt))
  echo "npm ci failed, retrying in ${wait_time}s (attempt ${attempt}/${max_attempts})" >&2
  sleep "$wait_time"
done

echo "Running npm install $* as a fallback" >&2
npm install "$@"
