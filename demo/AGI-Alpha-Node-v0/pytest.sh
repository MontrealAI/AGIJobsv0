#!/usr/bin/env bash
set -euo pipefail

# Ensure pytest runs with the same environment assumptions as CI.
# We explicitly disable third-party plugin autoloading to avoid crashes from
# globally installed extensions (for example, the web3 pytest helpers that
# expect legacy eth_typing symbols). We also prepend the repository root to
# PYTHONPATH so our compatibility shims remain discoverable even when the
# console-script wrapper sets sys.path[0] to the pyenv bin directory.

REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"
export PYTEST_DISABLE_PLUGIN_AUTOLOAD="${PYTEST_DISABLE_PLUGIN_AUTOLOAD:-1}"
export PYTHONPATH="${PYTHONPATH:-${REPO_ROOT}}"

exec python -m pytest "$@"
