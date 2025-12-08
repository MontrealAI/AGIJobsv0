"""Local compatibility shim to stabilise pytest plugin imports.

The global repository already ships ``eth_typing.py`` at the root to restore
legacy aliases (for example ``ContractName``) expected by third-party pytest
plugins. When tests in this demo run from a nested working directory, Python's
import resolution does not pick up the root shim before site-packages. That can
cause ``web3.tools.pytest_ethereum`` to crash during plugin autoloading.

By delegating to the repository-level shim we ensure the same behaviour is
available locally without duplicating implementation. Keeping the dependency
chain explicit here guards against brittle environment differences while
honouring the centralised shim logic.
"""
from __future__ import annotations

import runpy
from pathlib import Path

_ROOT_SHIM = Path(__file__).resolve().parents[2] / "eth_typing.py"
if not _ROOT_SHIM.exists():  # pragma: no cover - defensive guard for unusual layouts
    raise ImportError(f"Expected eth_typing shim missing at {_ROOT_SHIM}")

_globals = runpy.run_path(str(_ROOT_SHIM))

# Re-export everything except dunder attributes to emulate the upstream module
# surface for callers that import ``eth_typing`` from this demo directory.
for _name, _value in _globals.items():
    if _name.startswith("__"):
        continue
    globals()[_name] = _value

__all__ = [name for name in globals() if not name.startswith("__")]
