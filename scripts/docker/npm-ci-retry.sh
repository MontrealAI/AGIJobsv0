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

if [ "$current_npm_version" != "$corepack_npm_version" ]; then
  echo "[docker-npm-ci] INFO: Installing npm@${corepack_npm_version} globally (current $current_npm_version)" >&2
  if npm install -g "npm@${corepack_npm_version}" >/dev/null 2>&1; then
    hash -r 2>/dev/null || true
    current_npm_version="$(npm -v 2>/dev/null || printf '')"
  else
    echo "[docker-npm-ci] WARNING: Failed to install npm@${corepack_npm_version} globally; continuing with npm $current_npm_version" >&2
  fi
fi

if ! node -e 'const fs=require("fs");const path=process.argv[1];let raw="";try{raw=fs.readFileSync(path,"utf8");}catch(err){console.error(err.message);process.exit(1);}if(!raw.trim()){console.error("lockfile empty");process.exit(2);}let parsed;try{parsed=JSON.parse(raw);}catch(err){console.error(err.message);process.exit(3);}if(typeof parsed.lockfileVersion!=="number"||parsed.lockfileVersion<1){console.error("invalid lockfileVersion");process.exit(4);}' "$lockfile_path" >/dev/null 2>&1; then
  echo "[docker-npm-ci] ERROR: package-lock.json at $lockfile_path failed validation" >&2
  echo "[docker-npm-ci] Ensure the file exists, is populated, and generated with npm@${corepack_npm_version}" >&2
  exit 1
fi

attempt=1
max_attempts=${NPM_CI_MAX_ATTEMPTS:-5}
base_delay=${NPM_CI_RETRY_DELAY:-5}

export npm_config_package_lock=true
export npm_config_fund=false
export npm_config_audit=false

echo "[docker-npm-ci] node $(node -v 2>/dev/null || printf 'unknown')" >&2
echo "[docker-npm-ci] npm $(npm -v 2>/dev/null || printf 'unknown')" >&2
echo "[docker-npm-ci] installing in ${project_root}" >&2
if command -v stat >/dev/null 2>&1; then
  lock_stat="$(stat -c '%s bytes' "$lockfile_path" 2>/dev/null || printf 'size unknown')"
else
  lock_stat="size unknown"
fi

echo "[docker-npm-ci] lockfile: ${lockfile_path} (${lock_stat})" >&2

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
