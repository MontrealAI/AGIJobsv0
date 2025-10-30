"""Utilities to construct interestingness oracles."""
from __future__ import annotations

import pathlib
import sys
from typing import Iterable, Mapping

CURRENT_DIR = pathlib.Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from engine import InterestingnessOracle, StubInterestingnessOracle, build_stub_oracle  # type: ignore


class OracleFactory:
    """Factory for interestingness oracles from config dictionaries."""

    def build(self, config: Mapping[str, object]) -> InterestingnessOracle:
        model = str(config.get("model", "stub"))
        if model == "stub":
            profiles = config.get("stub_profiles", [])
            if not isinstance(profiles, Iterable):
                raise ValueError("stub_profiles must be iterable")
            return build_stub_oracle(profiles)
        raise ValueError(f"Unsupported interestingness model '{model}' for demo")
