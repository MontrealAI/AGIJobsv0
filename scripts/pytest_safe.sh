#!/usr/bin/env bash
set -euo pipefail

# Ensure pytest runs in an isolated, reproducible environment where the local
# compatibility shims (for example the eth_typing backport) take precedence over
# globally installed plugins.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Disable third-party plugin autoload to prevent globally installed plugins from
# breaking collection before our own configuration is applied.
export PYTEST_DISABLE_PLUGIN_AUTOLOAD="${PYTEST_DISABLE_PLUGIN_AUTOLOAD:-1}"

# Guarantee the repository root is first on sys.path so local shims such as
# eth_typing.py shadow upstream packages when required by the demos.
if [[ -n "${PYTHONPATH:-}" ]]; then
  export PYTHONPATH="${REPO_ROOT}:${PYTHONPATH}"
else
  export PYTHONPATH="${REPO_ROOT}"
fi

exec python -m pytest "$@"
