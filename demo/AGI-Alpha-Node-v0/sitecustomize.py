"""Local site customisation for the AGI Alpha Node demo."""
from __future__ import annotations

import os
import runpy
from pathlib import Path

# Ensure pytest does not auto-load globally installed plugins. Some plugins
# (for example ``web3.tools.pytest_ethereum``) import optional dependencies
# that are not part of this workspace and will crash test discovery. Setting
# the environment flag here means ``pytest`` works even when executed from this
# demo directory directly.
os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

# Reuse the repository-wide sitecustomize so we inherit shared path tweaks and
# helper configuration when running from this nested demo directory.
REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED_CUSTOMIZE = REPO_ROOT / "sitecustomize.py"
if SHARED_CUSTOMIZE.exists():
    runpy.run_path(str(SHARED_CUSTOMIZE))
