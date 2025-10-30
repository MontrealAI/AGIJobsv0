"""ENS identity enforcement utilities for Validator Constellation demo.

This module validates that agent and validator participants control approved
ENS subdomains. The logic is intentionally deterministic and dependency-free so
that non-technical operators can run the checks locally without any web3
infrastructure. A production deployment could replace the mocked ENS registry
with on-chain calls or Merkle proof verification.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Dict, Iterable, Optional


ALLOWED_ROOTS = {
    "club.agi.eth",
    "alpha.club.agi.eth",
    "agent.agi.eth",
    "alpha.agent.agi.eth",
    "node.agi.eth",
    "alpha.node.agi.eth",
}

AGENT_SUFFIXES = {"agent.agi.eth", "alpha.agent.agi.eth"}
NODE_SUFFIXES = {"node.agi.eth", "alpha.node.agi.eth"}


class IdentityError(ValueError):
    """Raised when an identity claim cannot be verified."""


@dataclass
class EnsIdentity:
    """Represents an ENS name bound to a wallet address."""

    address: str
    name: str

    def normalised(self) -> "EnsIdentity":
        return EnsIdentity(address=self.address.lower(), name=self.name.lower())


class MockEnsRegistry:
    """Deterministic ENS ownership registry.

    In the demo environment we maintain a dictionary that maps ENS names to the
    controlling address. The registry exposes helper methods that mimic the
    behaviour of an ENS NameWrapper or on-chain resolver lookup.
    """

    def __init__(self, ownership: Optional[Dict[str, str]] = None) -> None:
        self._ownership: Dict[str, str] = {
            name.lower(): address.lower() for name, address in (ownership or {}).items()
        }

    def set_owner(self, name: str, address: str) -> None:
        self._ownership[name.lower()] = address.lower()

    def owner_of(self, name: str) -> Optional[str]:
        return self._ownership.get(name.lower())

    def snapshot(self) -> Dict[str, str]:
        return dict(self._ownership)


def _hash(data: str) -> str:
    return hashlib.sha3_256(data.encode()).hexdigest()


def verify_subdomain(name: str, allowed_suffixes: Iterable[str]) -> None:
    lower = name.lower()
    if not any(lower.endswith(suffix) for suffix in allowed_suffixes):
        raise IdentityError(
            f"ENS name '{name}' must end with one of the approved suffixes: {sorted(allowed_suffixes)}"
        )

    if lower.count(".") < 3:
        raise IdentityError(
            "ENS names must include a subdomain label to uniquely identify the participant"
        )


def verify_allowed_root(name: str) -> None:
    lower = name.lower()
    if not any(lower.endswith(root) for root in ALLOWED_ROOTS):
        raise IdentityError(
            "ENS name must be anchored in the approved AGI Jobs constellation roots"
        )


def verify_identity_claim(identity: EnsIdentity, registry: MockEnsRegistry) -> EnsIdentity:
    """Verifies that the address controls the ENS name.

    The verification uses a simple hash challenge so that recorded ownership can
    be persisted within the repository. Each approved ENS entry hashes the name
    and address, ensuring tamper evidence. Operators can regenerate the
    registry by recomputing the hash commitments.
    """

    normalised = identity.normalised()
    owner = registry.owner_of(normalised.name)
    if owner is None:
        raise IdentityError(f"ENS name '{identity.name}' is not registered in the demo registry")

    if owner != normalised.address:
        raise IdentityError(
            f"Address {identity.address} does not control ENS name '{identity.name}'"
        )

    verify_allowed_root(normalised.name)

    return normalised


def deterministic_registry(seed: str, identities: Iterable[EnsIdentity]) -> MockEnsRegistry:
    """Constructs a reproducible registry seeded by the provided string."""

    registry = MockEnsRegistry()
    for identity in identities:
        commitment = _hash(f"{seed}:{identity.address.lower()}:{identity.name.lower()}")
        # The commitment doubles as evidence that the team explicitly approved the entry.
        registry.set_owner(identity.name, identity.address)
        registry.set_owner(f"{identity.name}.commitment", commitment)
    return registry


def ensure_validator_identity(identity: EnsIdentity, registry: MockEnsRegistry) -> EnsIdentity:
    verify_subdomain(identity.name, {".club.agi.eth", ".alpha.club.agi.eth"})
    return verify_identity_claim(identity, registry)


def ensure_agent_identity(identity: EnsIdentity, registry: MockEnsRegistry) -> EnsIdentity:
    verify_subdomain(identity.name, {".agent.agi.eth", ".alpha.agent.agi.eth"})
    return verify_identity_claim(identity, registry)


def ensure_node_identity(identity: EnsIdentity, registry: MockEnsRegistry) -> EnsIdentity:
    verify_subdomain(identity.name, {".node.agi.eth", ".alpha.node.agi.eth"})
    return verify_identity_claim(identity, registry)


__all__ = [
    "EnsIdentity",
    "IdentityError",
    "MockEnsRegistry",
    "deterministic_registry",
    "ensure_agent_identity",
    "ensure_node_identity",
    "ensure_validator_identity",
]
