"""ENS verification helpers without external dependencies."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from eth_utils import keccak
from web3 import Web3

from .client import Web3Config, get_web3

logger = logging.getLogger(__name__)


ENS_REGISTRY = Web3.to_checksum_address("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e")


def _labelhash(label: str) -> bytes:
    return keccak(text=label)


def namehash(name: str) -> bytes:
    """Computes the ENS namehash for a domain."""
    node = b"\x00" * 32
    if name:
        labels = name.split(".")
        for label in reversed(labels):
            node = keccak(node + _labelhash(label))
    return node


ENS_REGISTRY_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "node", "type": "bytes32"}],
        "name": "owner",
        "outputs": [{"name": "", "type": "address"}],
        "payable": False,
        "stateMutability": "view",
        "type": "function",
    }
]


@dataclass(slots=True)
class ENSVerifier:
    config: Web3Config

    def _contract(self):
        web3 = get_web3(self.config)
        return web3.eth.contract(address=ENS_REGISTRY, abi=ENS_REGISTRY_ABI)

    def resolve_owner(self, domain: str) -> Optional[str]:
        contract = self._contract()
        node = namehash(domain)
        owner = contract.functions.owner(node).call()
        if isinstance(owner, bytes):
            owner_hex = "0x" + owner.hex()
        else:
            owner_hex = str(owner)
        if int(owner_hex, 16) == 0:
            logger.warning("ENS domain not registered", extra={"domain": domain})
            return None
        owner_checksum = Web3.to_checksum_address(owner_hex)
        logger.debug("Resolved ENS owner", extra={"domain": domain, "owner": owner_checksum})
        return owner_checksum

    def verify_owner(self, domain: str, expected_owner: str) -> bool:
        owner = self.resolve_owner(domain)
        if owner is None:
            return False
        is_match = owner.lower() == Web3.to_checksum_address(expected_owner).lower()
        if not is_match:
            logger.error(
                "ENS domain ownership mismatch",
                extra={"domain": domain, "owner": owner, "expected_owner": expected_owner},
            )
        return is_match


__all__ = ["ENSVerifier"]
