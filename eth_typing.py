"""Compatibility shim for the upstream :mod:`eth_typing` package.

The ``web3.tools.pytest_ethereum`` plugin imports ``ContractName`` from
``eth_typing``, but modern releases remove that alias. When pytest autoloads the
plugin from a global installation, collection fails before the repository's
pytest hooks can disable the plugin. This shim loads the real ``eth_typing``
module from site-packages, re-exports its symbols, and restores the missing
alias so collection remains stable in any environment.
"""

from __future__ import annotations

import importlib.util
import sys
import sysconfig
from pathlib import Path
from typing import NewType


def _load_backend():
    """Load the real :mod:`eth_typing` package from site-packages."""

    site_packages = Path(sysconfig.get_paths()["purelib"])
    backend_path = site_packages / "eth_typing" / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        "eth_typing",
        backend_path,
        submodule_search_locations=[str(backend_path.parent)],
    )
    if spec is None or spec.loader is None:
        raise ImportError("Unable to locate installed eth_typing backend")

    module = importlib.util.module_from_spec(spec)
    loader = spec.loader

    # Allow relative imports inside the backend to resolve to the real package
    # while keeping this shim registered under ``eth_typing``.
    shim_module = sys.modules.get("eth_typing")
    sys.modules["eth_typing"] = module
    try:
        loader.exec_module(module)
    finally:
        if shim_module is not None:
            sys.modules["eth_typing"] = shim_module
        else:  # pragma: no cover - defensive cleanup
            sys.modules.pop("eth_typing", None)

    return module


_backend = _load_backend()

# Re-export everything from the backend to preserve behaviour for downstream
# imports. We avoid clobbering dunder attributes to keep module metadata intact.
for _name in dir(_backend):
    if _name.startswith("__"):
        continue
    globals()[_name] = getattr(_backend, _name)

# Restore the legacy alias expected by ``web3.tools.pytest_ethereum`` when the
# installed ``eth_typing`` version omits it.
if "ContractName" not in globals():
    ContractName = NewType("ContractName", str)  # type: ignore[assignment]
if "Manifest" not in globals():
    Manifest = dict[str, object]

# Keep a reference to the wrapped module for debugging and to surface its
# version metadata when available.
BACKEND_MODULE = _backend
__all__ = [name for name in globals() if not name.startswith("_")]
