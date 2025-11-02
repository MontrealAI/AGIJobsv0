#!/bin/sh
set -eu

# Enable pipefail when supported (e.g., bash) to match original behavior.
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

project_root=${NPM_CI_PROJECT_ROOT:-$(pwd)}
lockfile_path=${NPM_CI_LOCK_PATH:-${project_root}/package-lock.json}
package_json_path=${NPM_CI_PACKAGE_JSON_PATH:-${project_root}/package.json}

if [ ! -f "$package_json_path" ]; then
  echo "package.json not found at ${package_json_path}" >&2
  echo "Current directory: $(pwd)" >&2
  if [ -d "$project_root" ]; then
    echo "Project root contents:" >&2
    ls -al "$project_root" >&2
  fi
  exit 1
fi

if [ ! -f "$lockfile_path" ]; then
  echo "package-lock.json not found at ${lockfile_path}" >&2
  echo "Current directory: $(pwd)" >&2
  if [ -d "$project_root" ]; then
    echo "Project root contents:" >&2
    ls -al "$project_root" >&2
  fi
  exit 1
fi

required_node_version="${NPM_CI_MIN_NODE_VERSION:-20.19.0}"
current_node_version="$(node -v 2>/dev/null || printf '')"
version_check_script="${project_root}/scripts/ci/version-check.mjs"

if [ -n "$current_node_version" ] && [ -f "$version_check_script" ]; then
  if ! node "$version_check_script" "$current_node_version" "$required_node_version"; then
    echo "[docker-npm-ci] WARNING: Node $current_node_version is older than required $required_node_version" >&2
  fi
fi

corepack_npm_version="${NPM_CI_NPM_VERSION:-11.4.2}"
current_npm_version="$(npm -v 2>/dev/null || printf '')"

if command -v corepack >/dev/null 2>&1; then
  if [ "$current_npm_version" != "$corepack_npm_version" ]; then
    if corepack enable >/dev/null 2>&1; then
      if corepack prepare "npm@${corepack_npm_version}" --activate >/dev/null 2>&1; then
        current_npm_version="$(npm -v 2>/dev/null || printf '')"
      else
        echo "[docker-npm-ci] WARNING: corepack prepare npm@${corepack_npm_version} failed; continuing with npm $current_npm_version" >&2
      fi
    else
      echo "[docker-npm-ci] WARNING: Failed to enable corepack; continuing with npm $current_npm_version" >&2
    fi
  fi
fi

npm_exec="npm"
npm_prepare_args=""

if [ "$current_npm_version" != "$corepack_npm_version" ]; then
  if command -v npx >/dev/null 2>&1; then
    echo "[docker-npm-ci] activating npm@${corepack_npm_version} via npx fallback" >&2
    npm_exec="npx"
    npm_prepare_args="--yes npm@${corepack_npm_version}"
    current_npm_version="$($npm_exec $npm_prepare_args -v 2>/dev/null || printf '')"
  else
    echo "[docker-npm-ci] WARNING: Unable to locate npx for npm@${corepack_npm_version}; continuing with npm ${current_npm_version:-unknown}" >&2
  fi
fi

if [ -z "$current_npm_version" ]; then
  current_npm_version="unknown"
fi

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}

export npm_config_package_lock=true
export npm_config_fund=false
export npm_config_audit=false

# Clear any prefix overrides that npx might inject so npm always evaluates the
# lockfile relative to the intended project root.
unset npm_config_prefix
unset NPM_CONFIG_PREFIX

echo "[docker-npm-ci] node $(node -v 2>/dev/null || printf 'unknown')" >&2
echo "[docker-npm-ci] npm ${current_npm_version}" >&2
echo "[docker-npm-ci] installing in ${project_root}" >&2
echo "[docker-npm-ci] lockfile: ${lockfile_path}" >&2

while [ "$attempt" -le "$max_attempts" ]; do
  if [ -d "${project_root}/node_modules" ]; then
    echo "[docker-npm-ci] removing existing node_modules (attempt ${attempt}/${max_attempts})" >&2
    chmod -R u+w "${project_root}/node_modules" 2>/dev/null || true
    rm -rf "${project_root}/node_modules"
    if [ -d "${project_root}/node_modules" ]; then
      python3 - "${project_root}/node_modules" <<'PY' 2>/dev/null || true
import shutil, sys
from pathlib import Path
target = Path(sys.argv[1])
if target.exists():
    shutil.rmtree(target)
PY
    fi
  fi

  status=1
  output=""

  if [ -n "$npm_prepare_args" ]; then
    set +e
    output="$(cd "$project_root" && $npm_exec $npm_prepare_args ci "$@" 2>&1)"
    status=$?
    set -e
  else
    set +e
    output="$(cd "$project_root" && $npm_exec ci "$@" 2>&1)"
    status=$?
    set -e
  fi

  printf '%s\n' "$output"

  if [ "$status" -ne 0 ] && printf '%s\n' "$output" | grep -q "The \`npm ci\` command can only install with an existing package-lock.json"; then
    fallback_version="$(npm -v 2>/dev/null || printf 'unknown')"
    echo "[docker-npm-ci] WARNING: npm ${current_npm_version} could not detect the lockfile; retrying with system npm ${fallback_version}" >&2
    set +e
    output="$(cd "$project_root" && npm ci "$@" 2>&1)"
    status=$?
    set -e
    printf '%s\n' "$output"
  fi

  if [ "$status" -eq 0 ]; then
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
