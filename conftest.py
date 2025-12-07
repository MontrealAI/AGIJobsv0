"""Repository-wide pytest configuration.

This file keeps test discovery deterministic by pinning the import path and
environment variables that several suites expect. Having the repository root in
``sys.path`` ensures demo and service packages resolve consistently without
relying on the caller's working directory. We also provide default values for
test shims used by the Onebox routes.
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent

# Make repository modules importable regardless of the invocation directory.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Standardize environment defaults for local runs.
os.environ.setdefault("PYTHONPATH", str(ROOT))
os.environ.setdefault("ONEBOX_TEST_FORCE_STUB_WEB3", "1")


_SECURITY_ENV_KEYS = [
    "API_TOKEN",
    "ONEBOX_API_TOKEN",
    "ONEBOX_API_TOKEN_ROLE",
    "API_TOKEN_DEFAULT_ROLE",
    "API_TOKEN_ROLES",
    "ONEBOX_TOKEN_ROLES",
    "API_SIGNING_SECRET",
    "ONEBOX_SIGNING_SECRET",
    "API_RATE_LIMIT_PER_MINUTE",
    "ONEBOX_RATE_LIMIT_PER_MINUTE",
]


def _prime_onebox_state() -> None:
    """Reload ``routes.onebox`` with a clean configuration surface.

    Pytest fixtures do not execute for ``unittest``-style tests, so we rely on
    the runtest hooks below to scrub environment variables, reload the Onebox
    module, and reset rate limiting before *every* test item. This avoids
    cross-test leakage of API tokens, cached registry state, or security
    settings that would otherwise cause the meta-orchestrator and AA tests to
    behave inconsistently when the full suite runs.
    """

    for key in _SECURITY_ENV_KEYS:
        os.environ.pop(key, None)

    try:
        onebox = sys.modules.get("routes.onebox")
        if onebox is None:
            import routes.onebox as onebox  # type: ignore
        importlib.reload(onebox)
        sys.modules["routes.onebox"] = onebox
    except Exception:
        # Leave the module untouched when optional dependencies are missing; the
        # tests that require it will handle skips explicitly.
        pass

    try:
        from routes import security

        importlib.reload(security)
        security.reset_rate_limits()
    except Exception:
        pass


def _cleanup_onebox_state() -> None:
    try:
        from routes import security

        importlib.reload(security)
        security.reset_rate_limits()
    except Exception:
        pass


def pytest_runtest_setup(item):
    _prime_onebox_state()


def pytest_runtest_teardown(item):
    _cleanup_onebox_state()
