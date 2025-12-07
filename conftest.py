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


@pytest.fixture(autouse=True)
def _reset_onebox_state():
    """Ensure ``routes.onebox`` does not leak state between tests.

    Several suites monkeypatch module globals (for example API tokens or
    stubbed registries). Without reloading, those mutations bleed into
    later tests and cause unexpected pass-throughs of security checks or
    cached blockchain state. By ejecting the module before and after each
    test we guarantee a clean import and re-run of configuration loaders,
    while also resetting rate limits to their defaults.
    """

    # Instead of removing the module entirely (which causes subsequent
    # imports to ignore monkeypatched attributes like ``_API_TOKEN``), reload
    # it so each test gets a clean instance that still lives in
    # ``sys.modules``. This preserves per-test overrides while avoiding state
    # leakage from prior runs.
    # Clear configuration env vars that can leak between tests and influence
    # security settings. Tests that need specific values will re-apply them
    # via ``monkeypatch.setenv``.
    for key in [
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
    ]:
        os.environ.pop(key, None)

    try:
        import routes.onebox as onebox  # type: ignore

        importlib.reload(onebox)
        sys.modules["routes.onebox"] = onebox
    except Exception:
        # Environments without FastAPI or the optional deps used by the
        # routes may legitimately fail to import; let the test control flow
        # continue so those suites can skip or stub as needed.
        sys.modules.pop("routes.onebox", None)

    yield

    sys.modules.pop("routes.onebox", None)
    try:
        from routes import security

        importlib.reload(security)
        security.reset_rate_limits()
    except Exception:
        # Test environments without FastAPI or optional deps may hit import
        # errors; failures here would mask the original assertion.
        pass
