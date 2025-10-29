from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Dict, Iterable, Optional, Sequence, Tuple


def _normalize(text: str) -> str:
    return text.strip().lower()


@dataclass
class IdentityProof:
    ens: str
    address: str
    signature: str


class ENSIdentityVerifier:
    """Deterministic ENS verifier with blacklist support."""

    def __init__(
        self,
        validator_roots: Sequence[str],
        agent_roots: Sequence[str],
        node_roots: Sequence[str],
        *,
        blacklist: Iterable[str] | None = None,
    ) -> None:
        self.validator_roots = tuple(_normalize(root) for root in validator_roots)
        self.agent_roots = tuple(_normalize(root) for root in agent_roots)
        self.node_roots = tuple(_normalize(root) for root in node_roots)
        self.blacklist = {addr.lower() for addr in blacklist or []}
        self._registry: Dict[str, str] = {}
        self._secret = "validator-constellation-secret"

    def sign(self, ens: str, address: str) -> IdentityProof:
        normalized_ens = _normalize(ens)
        normalized_address = address.lower()
        digest = hashlib.sha3_256(
            f"{normalized_ens}:{normalized_address}:{self._secret}".encode()
        ).hexdigest()
        return IdentityProof(normalized_ens, normalized_address, digest)

    def _ensure_allowed(self, ens: str, roots: Tuple[str, ...]) -> None:
        if not any(ens.endswith(root) for root in roots):
            raise PermissionError(f"ENS {ens} not in authorised roots {roots}")

    def _record(self, ens: str, address: str) -> None:
        self._registry[ens] = address

    def _verify(self, proof: IdentityProof, roots: Tuple[str, ...]) -> None:
        if proof.address in self.blacklist:
            raise PermissionError("address blacklisted")
        self._ensure_allowed(proof.ens, roots)
        expected = self.sign(proof.ens, proof.address).signature
        if expected != proof.signature:
            raise PermissionError("invalid ENS proof")
        self._record(proof.ens, proof.address)

    def verify_validator(self, address: str, proof: IdentityProof) -> None:
        if proof.address != address.lower():
            raise PermissionError("proof does not match address")
        self._verify(proof, self.validator_roots)

    def verify_agent(self, address: str, proof: IdentityProof) -> None:
        if proof.address != address.lower():
            raise PermissionError("proof does not match address")
        self._verify(proof, self.agent_roots)

    def verify_node(self, address: str, proof: IdentityProof) -> None:
        if proof.address != address.lower():
            raise PermissionError("proof does not match address")
        self._verify(proof, self.node_roots)

    def resolve(self, ens: str) -> Optional[str]:
        return self._registry.get(_normalize(ens))
