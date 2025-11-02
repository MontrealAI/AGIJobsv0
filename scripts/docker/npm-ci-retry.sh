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

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}

export npm_config_package_lock=true
export npm_config_fund=false
export npm_config_audit=false

echo "[docker-npm-ci] installing in ${project_root}" >&2
echo "[docker-npm-ci] lockfile: ${lockfile_path}" >&2

while [ "$attempt" -le "$max_attempts" ]; do
  rm -rf "${project_root}/node_modules"

  if (cd "$project_root" && npm ci "$@"); then
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
