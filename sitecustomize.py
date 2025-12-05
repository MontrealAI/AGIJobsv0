"""Project-wide interpreter customisation used during development and tests."""

import os
import sys

# Disable third-party pytest entry point discovery to keep the test environment
# deterministic. Some globally installed plugins (for example, the `web3`
# pytest tools) pull in optional dependencies that are not part of this
# repository. Setting ``PYTEST_DISABLE_PLUGIN_AUTOLOAD`` here ensures the
# environment matches our locked requirements for both local runs and CI.
os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

# Ensure the repository root and local packages stay importable, mirroring the
# previous behaviour. This allows ``python -m pytest`` from anywhere in the
# repo to resolve intra-package imports without additional PYTHONPATH tweaks.
ROOT = os.path.dirname(__file__)
EXTRA_PATHS = [
    ROOT,
    os.path.join(ROOT, "packages", "hgm-core", "src"),
]

for _path in EXTRA_PATHS:
    if _path and _path not in sys.path:
        sys.path.insert(0, _path)
