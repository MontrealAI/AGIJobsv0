"""ENS identity enforcement utilities."""

from __future__ import annotations

import hmac
import re
from dataclasses import dataclass
from hashlib import blake2b
from typing import Iterable, Sequence


_ENS_PATTERN = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$")


@dataclass(slots=True, frozen=True)
class ENSOwnershipProof:
    """Represents a lightweight ENS ownership attestation.

    The signature is produced via ``ENSIdentityVerifier.sign`` in
    this demo.  In production the signature would be derived from
    ENS NameWrapper or registry proofs, but mimicking this contract
    interface keeps the logic approachable for non-technical
    operators while remaining cryptographically sound.
    """

    name: str
    owner: str
    signature: str


class ENSIdentityVerifier:
    """Validates ENS subdomains for agents, validators and nodes."""

    def __init__(
        self,
        allowed_validator_roots: Sequence[str],
        allowed_agent_roots: Sequence[str],
        allowed_node_roots: Sequence[str],
        blacklist: Iterable[str] = (),
        secret: bytes | None = None,
    ) -> None:
        self.allowed_validator_roots = tuple(root.lower() for root in allowed_validator_roots)
        self.allowed_agent_roots = tuple(root.lower() for root in allowed_agent_roots)
        self.allowed_node_roots = tuple(root.lower() for root in allowed_node_roots)
        self.blacklist = {address.lower() for address in blacklist}
        self._secret = secret or b"validator-constellation::ens"

    def _assert_valid_format(self, name: str) -> None:
        if not _ENS_PATTERN.match(name):
            raise ValueError(f"Invalid ENS name: {name}")

    def _normalize(self, name: str) -> str:
        return name.lower().strip()

    def _extract_root(self, name: str, levels: int = 3) -> str:
        parts = name.split(".")
        if len(parts) < levels:
            raise ValueError(f"ENS name '{name}' too short for required namespace")
        return ".".join(parts[-levels:])

    def _check_blacklist(self, address: str) -> None:
        if address.lower() in self.blacklist:
            raise PermissionError(f"Address {address} is blacklisted")

    def verify_validator(self, address: str, proof: ENSOwnershipProof) -> None:
        self._verify(address, proof, self.allowed_validator_roots)

    def verify_agent(self, address: str, proof: ENSOwnershipProof) -> None:
        self._verify(address, proof, self.allowed_agent_roots)

    def verify_node(self, address: str, proof: ENSOwnershipProof) -> None:
        self._verify(address, proof, self.allowed_node_roots)

    def _verify(self, address: str, proof: ENSOwnershipProof, allowed_roots: Sequence[str]) -> None:
        address = address.lower()
        name = self._normalize(proof.name)
        self._assert_valid_format(name)
        self._check_blacklist(address)
        if proof.owner.lower() != address:
            raise PermissionError("Ownership proof does not match address")
        root = self._extract_root(name)
        if root not in allowed_roots:
            raise PermissionError(f"ENS name {name} not under approved namespace")
        expected = self.sign(name, address)
        if not hmac.compare_digest(expected.signature, proof.signature):
            raise PermissionError("Invalid ENS ownership signature")

    def sign(self, name: str, owner: str) -> ENSOwnershipProof:
        name = self._normalize(name)
        self._assert_valid_format(name)
        digest = blake2b(digest_size=32)
        digest.update(self._secret)
        digest.update(name.encode())
        digest.update(owner.lower().encode())
        signature = digest.hexdigest()
        return ENSOwnershipProof(name=name, owner=owner.lower(), signature=signature)
