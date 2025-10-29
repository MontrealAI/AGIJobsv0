"""Core package for the AGI Alpha Node demo.

This package bundles a production-oriented yet self-contained implementation of
an Alpha Node that exercises the AGI Jobs v0 (v2) architecture.  The module is
structured to provide a non-technical operator with a turnkey experience while
keeping each subsystem testable and auditable.
"""

from .config import AlphaNodeConfig
from .node import AlphaNode

__all__ = ["AlphaNodeConfig", "AlphaNode"]
