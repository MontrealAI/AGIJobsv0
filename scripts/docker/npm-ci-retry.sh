#!/bin/sh
set -eu

# Enable pipefail when supported (e.g., bash) to match original behavior.
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

run_npm_install() {
  echo "Falling back to 'npm install' with args: $*" >&2
  npm install "$@"
}

if [ "${NPM_CI_PREFER_INSTALL:-0}" = "1" ]; then
  run_npm_install "$@"
  exit $?
fi

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}
allow_fallback=${NPM_CI_ALLOW_FALLBACK:-1}

while [ "$attempt" -le "$max_attempts" ]; do
  rm -rf node_modules

  ci_output=""
  if ci_output=$(npm ci "$@" 2>&1); then
    printf "%s\n" "$ci_output"
    exit 0
  fi

  printf "%s\n" "$ci_output" >&2

  if printf "%s" "$ci_output" | grep -qi "The \`npm ci\` command can only install"; then
    echo "Detected npm ci lockfile incompatibility." >&2
    if [ "$allow_fallback" = "1" ]; then
      run_npm_install "$@"
      exit $?
    fi
    break
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    break
  fi

  attempt=$((attempt + 1))
  wait_time=$((base_delay * attempt))
  echo "npm ci failed, retrying in ${wait_time}s (attempt ${attempt}/${max_attempts})" >&2
  sleep "$wait_time"
done

if [ "$allow_fallback" = "1" ]; then
  run_npm_install "$@"
  exit $?
fi

echo "npm ci failed after ${max_attempts} attempts and fallback disabled" >&2
exit 1
