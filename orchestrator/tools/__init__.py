"""Tool registry loader for the meta-orchestrator."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, Dict, List

_REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "config", "tools.registry.json")


@lru_cache(maxsize=1)
def load_registry() -> List[Dict[str, Any]]:
    """Return the list of configured tools."""

    try:
        with open(_REGISTRY_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data.get("tools", []) if isinstance(data, dict) else []
    except FileNotFoundError:
        return []

