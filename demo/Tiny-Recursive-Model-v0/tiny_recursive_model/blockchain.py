"""Blockchain governance helpers for Tiny Recursive Model telemetry."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class LedgerGovernor:
    owner_address: str

    def payload_for_update(self, parameter: str, value: Any) -> str:
        """Create a JSON payload suitable for on-chain or off-chain dispatch."""

        return json.dumps(
            {
                "type": "LedgerParameterUpdate",
                "owner": self.owner_address,
                "parameter": parameter,
                "value": value,
            }
        )

    def payload_for_pause(self, reason: str) -> str:
        return json.dumps(
            {
                "type": "LedgerPause",
                "owner": self.owner_address,
                "reason": reason,
            }
        )

    def payload_for_resume(self) -> str:
        return json.dumps(
            {
                "type": "LedgerResume",
                "owner": self.owner_address,
            }
        )
