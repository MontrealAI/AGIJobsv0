"""Identity and ENS verification primitives for the demo."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Dict, Tuple


@dataclass
class ENSVerificationResult:
    domain: str
    owner: str
    is_verified: bool
    registry_snapshot: Dict[str, str]

    def to_json(self) -> str:
        return json.dumps(
            {
                "domain": self.domain,
                "owner": self.owner,
                "is_verified": self.is_verified,
                "registry_snapshot": self.registry_snapshot,
            }
        )


class ENSVerifier:
    """Pure-Python ENS verifier used by the demo.

    In production this would call the ENS registry. Here we simulate by hashing the
    domain together with the expected owner address. The deterministic behaviour
    makes it trivial for non-technical operators to audit.
    """

    def __init__(self, registry: Dict[str, str] | None = None) -> None:
        self._registry = registry or {}

    def register(self, domain: str, owner: str) -> None:
        """Register a domain in the in-memory registry."""

        self._registry[self._normalise(domain)] = owner

    def _normalise(self, domain: str) -> str:
        return domain.strip().lower()

    def verify(self, domain: str, expected_owner: str) -> ENSVerificationResult:
        domain_key = self._normalise(domain)
        actual_owner = self._registry.get(domain_key)

        is_verified = actual_owner == expected_owner
        if actual_owner is None:
            # Deterministic fallback – the hash can be reproduced by auditors.
            synthetic_owner = self._synthetic_owner(domain_key)
            is_verified = synthetic_owner == expected_owner
            actual_owner = synthetic_owner

        return ENSVerificationResult(
            domain=domain,
            owner=actual_owner or "0x0",
            is_verified=is_verified,
            registry_snapshot=dict(self._registry),
        )

    def _synthetic_owner(self, domain_key: str) -> str:
        digest = hashlib.sha256(domain_key.encode("utf-8")).hexdigest()
        return "0x" + digest[:40]

    def export_state(self) -> Tuple[str, Dict[str, str]]:
        return ("ens_registry", dict(self._registry))
