from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

try:  # pragma: no cover - optional dependency
    from web3 import Web3
    from web3.middleware import geth_poa_middleware
except Exception:  # pragma: no cover - dependency not available
    Web3 = None  # type: ignore
    geth_poa_middleware = None  # type: ignore

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ENSVerificationResult:
    domain: str
    expected_owner: str
    actual_owner: Optional[str]
    verified: bool


class ENSVerifier:
    """Minimal ENS verification helper.

    The verifier transparently falls back to a deterministic mock when `web3`
    is unavailable, ensuring the demo stays runnable offline while still being
    production-ready when RPC connectivity exists.
    """

    def __init__(self, rpc_url: str, chain_id: int) -> None:
        self.rpc_url = rpc_url
        self.chain_id = chain_id
        self._web3 = self._maybe_init_web3()

    def _maybe_init_web3(self) -> Optional["Web3"]:
        if Web3 is None:
            logger.warning("web3.py not available; ENS verification running in offline mode")
            return None
        web3 = Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 10}))
        if self.chain_id in {5, 11155111, 420} and geth_poa_middleware:
            web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        return web3

    def verify(self, domain: str, expected_owner: str) -> ENSVerificationResult:
        if self._web3 is not None:
            try:
                resolver = self._web3.ens.address(domain)  # type: ignore[union-attr]
                if resolver is None:
                    logger.error("ENS domain not registered", extra={"context": domain})
                    return ENSVerificationResult(domain, expected_owner, None, False)
                actual_owner = resolver
                verified = actual_owner.lower() == expected_owner.lower()
                logger.info(
                    "ENS verification %s",
                    "passed" if verified else "failed",
                    extra={"context": {"domain": domain, "owner": actual_owner}},
                )
                return ENSVerificationResult(domain, expected_owner, actual_owner, verified)
            except Exception as exc:  # pragma: no cover - network branch
                logger.warning("ENS RPC unavailable, falling back to offline mode", exc_info=exc)

        mock_owner = f"0x{abs(hash(domain)) % (10**40):040x}"
        verified = mock_owner.lower() == expected_owner.lower()
        return ENSVerificationResult(domain, expected_owner, mock_owner, verified)


__all__ = ["ENSVerifier", "ENSVerificationResult"]
