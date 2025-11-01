#!/bin/sh
set -eu

# Enable pipefail when supported (e.g., bash) to match original behavior.
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}

lock_setting="$(npm config get package-lock 2>/dev/null || true)"
if [ "${lock_setting}" != "true" ]; then
  echo "npm config package-lock is '${lock_setting}', forcing it to 'true' for deterministic installs" >&2
  npm config set package-lock true >/dev/null
fi

while [ "$attempt" -le "$max_attempts" ]; do
  if [ ! -f package-lock.json ]; then
    echo "package-lock.json not found in $(pwd). Contents:" >&2
    ls -al >&2
    exit 1
  fi
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
