#!/usr/bin/env bash
set -euo pipefail

export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
export npm_config_fund=false
export npm_config_audit=false

npm ci "$@"
