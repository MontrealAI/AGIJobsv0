"""Policy helpers for the meta-orchestrator."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, Dict

DEFAULT_POLICY_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "policies.default.json")


@lru_cache(maxsize=1)
def load_default_policy() -> Dict[str, Any]:
    """Return the default policy configuration from disk."""

    try:
        with open(DEFAULT_POLICY_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {"allowTools": [], "denyTools": [], "requireValidator": True}

