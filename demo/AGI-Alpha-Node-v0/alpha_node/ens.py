"""ENS verification utilities."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Optional

from .logging_utils import get_logger

LOGGER = get_logger(__name__)


@dataclass(slots=True)
class ENSVerificationResult:
    domain: str
    expected_owner: str
    actual_owner: str
    verified: bool
    source: str


class ENSVerifier:
    """Lightweight ENS verifier.

    The verifier optionally consumes a JSON cache that maps ENS names to owner
    addresses.  When a live Ethereum RPC endpoint is configured alongside the
    ``web3`` dependency, the verifier performs an on-chain lookup.  Otherwise it
    falls back to a deterministic offline check so the demo remains functional
    in disconnected environments.
    """

    def __init__(self, rpc_url: str, cache_path: Optional[Path] = None) -> None:
        self.rpc_url = rpc_url
        self.cache_path = cache_path

    def resolve(self, domain: str) -> Optional[str]:
        owner = self._resolve_cache(domain)
        if owner:
            return owner
        owner = self._resolve_web3(domain)
        if owner:
            return owner
        return self._resolve_offline(domain)

    def verify(self, domain: str, expected_owner: str) -> ENSVerificationResult:
        actual_owner = self.resolve(domain) or "0x0000000000000000000000000000000000000000"
        verified = actual_owner.lower() == expected_owner.lower()
        source = "cache"
        if self.cache_path and self.cache_path.exists():
            cache_data = json.loads(self.cache_path.read_text(encoding="utf-8"))
            if domain in cache_data:
                source = "cache"
        if actual_owner.startswith("0x") and len(actual_owner) == 42:
            source = "on-chain" if self._web3_available else source
        if not verified:
            LOGGER.error(
                "ENS verification failed | domain=%s expected=%s actual=%s",
                domain,
                expected_owner,
                actual_owner,
            )
        else:
            LOGGER.info(
                "ENS verification succeeded | domain=%s owner=%s source=%s",
                domain,
                actual_owner,
                source,
            )
        return ENSVerificationResult(
            domain=domain,
            expected_owner=expected_owner,
            actual_owner=actual_owner,
            verified=verified,
            source=source,
        )

    @property
    def _web3_available(self) -> bool:
        try:
            import web3  # type: ignore
        except Exception:
            return False
        return bool(web3)

    def _resolve_web3(self, domain: str) -> Optional[str]:
        if not self._web3_available or not self.rpc_url:
            return None
        try:
            from ens.utils import normal_name_to_hash  # type: ignore
            from web3 import Web3  # type: ignore
        except Exception as exc:  # pragma: no cover - only executed when deps missing
            LOGGER.debug("web3 lookup unavailable: %s", exc)
            return None
        w3 = Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 3}))
        registry = w3.ens.address(domain)
        if registry:
            return registry
        # fallback manual registry read
        name_hash = normal_name_to_hash(domain)
        registry_contract = w3.eth.contract(address=w3.ens.address(""), abi=[])
        LOGGER.debug("ENS name hash for %s = %s", domain, name_hash.hex())
        return registry_contract.functions.owner(name_hash).call()  # type: ignore

    def _resolve_cache(self, domain: str) -> Optional[str]:
        if not self.cache_path or not self.cache_path.exists():
            return None
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8"))
            return data.get(domain)
        except json.JSONDecodeError as exc:  # pragma: no cover - configuration error
            LOGGER.warning("Invalid ENS cache: %s", exc)
            return None

    def _resolve_offline(self, domain: str) -> str:
        digest = hashlib.sha256(domain.encode("utf-8")).hexdigest()
        pseudo = "0x" + digest[:40]
        LOGGER.debug("Offline ENS pseudo owner for %s = %s", domain, pseudo)
        return pseudo


__all__ = ["ENSVerifier", "ENSVerificationResult"]
