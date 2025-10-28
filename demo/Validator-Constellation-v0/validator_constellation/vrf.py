"""Deterministic VRF-style committee selection."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import blake2b
from typing import Iterable, List, Sequence

from .staking import StakeManager


@dataclass(slots=True, frozen=True)
class VRFOutput:
    address: str
    randomness: int


class VRFCoordinator:
    """Provides deterministic VRF-like randomness for committee selection."""

    def __init__(self, stake_manager: StakeManager, domain: str) -> None:
        self._stake_manager = stake_manager
        self._domain = domain.encode()

    def _vrf(self, address: str, seed: str) -> VRFOutput:
        hasher = blake2b(digest_size=32)
        hasher.update(self._domain)
        hasher.update(address.lower().encode())
        hasher.update(seed.encode())
        randomness = int.from_bytes(hasher.digest(), "big")
        return VRFOutput(address=address.lower(), randomness=randomness)

    def select_committee(self, seed: str, committee_size: int) -> List[str]:
        validators = [v.address for v in self._stake_manager.validators.values() if v.active]
        if not validators:
            raise RuntimeError("No active validators to select from")
        outputs = [self._vrf(address, seed) for address in validators]
        outputs.sort(key=lambda item: item.randomness)
        return [output.address for output in outputs[:committee_size]]

    def prove(self, address: str, seed: str) -> VRFOutput:
        if not self._stake_manager.is_active(address):
            raise PermissionError("Inactive validators cannot produce VRF proofs")
        return self._vrf(address, seed)
