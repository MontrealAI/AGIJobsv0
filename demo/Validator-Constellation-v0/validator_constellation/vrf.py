from __future__ import annotations

import hashlib
from typing import List

from .staking import StakeManager


class VRFCoordinator:
    def __init__(self, stake_manager: StakeManager, domain: str) -> None:
        self.stake_manager = stake_manager
        self.domain = domain

    def _score(self, seed: str, address: str) -> int:
        digest = hashlib.blake2s(f"{seed}:{self.domain}:{address.lower()}".encode()).digest()
        return int.from_bytes(digest, "big")

    def select_committee(self, seed: str, size: int) -> List[str]:
        validators = list(self.stake_manager.active_validators().keys())
        if size > len(validators):
            raise ValueError("committee size exceeds validator set")
        sorted_addresses = sorted(validators, key=lambda addr: self._score(seed, addr))
        return sorted_addresses[:size]
