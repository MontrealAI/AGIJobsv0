"""ENS verification utilities for the AGI Alpha Node demo.

The verifier purposely supports both real Ethereum providers (via
:mod:`web3`) and an embedded offline registry.  The offline mode ensures a
non-technical user can experience the entire control flow without access
to mainnet infrastructure while still exercising the same code paths.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .config import ENSSettings

try:  # pragma: no cover - optional dependency
    from web3 import Web3
    from web3.middleware import geth_poa_middleware
except Exception:  # pragma: no cover - optional dependency
    Web3 = None  # type: ignore
    geth_poa_middleware = None  # type: ignore


@dataclass(slots=True)
class ENSVerificationResult:
    domain: str
    owner: str
    resolver: Optional[str]
    verified: bool
    source: str


class ENSVerifier:
    """Validate ENS domain ownership with graceful fallbacks."""

    def __init__(self, settings: ENSSettings, offline_registry: Path) -> None:
        self.settings = settings
        self.offline_registry = offline_registry

    def verify(self) -> ENSVerificationResult:
        if self.settings.provider_url and Web3 is not None:
            try:
                return self._verify_on_chain()
            except Exception as exc:  # pragma: no cover - defensive
                return ENSVerificationResult(
                    domain=self.settings.domain,
                    owner=self.settings.owner_address,
                    resolver=None,
                    verified=False,
                    source=f"on-chain error: {exc}",
                )
        return self._verify_offline()

    # ------------------------------------------------------------------
    def _verify_on_chain(self) -> ENSVerificationResult:
        assert Web3 is not None  # for type-checkers
        provider = Web3.HTTPProvider(self.settings.provider_url)
        w3 = Web3(provider)
        if geth_poa_middleware is not None:
            w3.middleware_onion.inject(geth_poa_middleware, layer=0)

        ns = w3.ens
        owner = ns.owner(self.settings.domain)
        resolver = ns.resolver(self.settings.domain)
        verified = owner is not None and owner.lower() == self.settings.owner_address.lower()
        if self.settings.expected_resolver:
            verified = (
                verified
                and resolver is not None
                and resolver.lower() == self.settings.expected_resolver.lower()
            )

        return ENSVerificationResult(
            domain=self.settings.domain,
            owner=owner or "0x0",
            resolver=resolver,
            verified=bool(verified),
            source="on-chain",
        )

    # ------------------------------------------------------------------
    def _verify_offline(self) -> ENSVerificationResult:
        if not self.offline_registry.exists():
            owner = "0x0000000000000000000000000000000000000000"
            return ENSVerificationResult(
                domain=self.settings.domain,
                owner=owner,
                resolver=None,
                verified=False,
                source="offline-registry-missing",
            )

        mapping = {
            line.split(",", 2)[0].strip(): line.split(",", 2)[1].strip()
            for line in self.offline_registry.read_text().splitlines()
            if "," in line
        }
        owner = mapping.get(self.settings.domain, "0x0")
        verified = owner.lower() == self.settings.owner_address.lower()
        return ENSVerificationResult(
            domain=self.settings.domain,
            owner=owner,
            resolver=self.settings.expected_resolver,
            verified=verified,
            source="offline",
        )


__all__ = ["ENSVerifier", "ENSVerificationResult"]
