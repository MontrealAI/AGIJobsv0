#!/bin/sh
set -eu

# Enable pipefail when supported (e.g., bash) to match original behavior.
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}
fallback_enabled=${NPM_CI_ENABLE_INSTALL_FALLBACK:-0}
missing_lock_message="npm ci command can only install with an existing package-lock.json"

run_fallback_install() {
  echo "Falling back to 'npm install'" >&2
  npm install "$@"
}

while [ "$attempt" -le "$max_attempts" ]; do
  rm -rf node_modules

  log_file=$(mktemp)
  if npm ci "$@" 2>&1 | tee "$log_file"; then
    rm -f "$log_file"
    exit 0
  fi

  if [ "$fallback_enabled" != "0" ]; then
    if [ ! -f package-lock.json ] || grep -q "$missing_lock_message" "$log_file"; then
      rm -f "$log_file"
      run_fallback_install "$@"
      exit $?
    fi
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    rm -f "$log_file"
    echo "npm ci failed after ${max_attempts} attempts" >&2
    exit 1
  fi

  rm -f "$log_file"
  attempt=$((attempt + 1))
  wait_time=$((base_delay * attempt))
  echo "npm ci failed, retrying in ${wait_time}s (attempt ${attempt}/${max_attempts})" >&2
  sleep "$wait_time"
done
