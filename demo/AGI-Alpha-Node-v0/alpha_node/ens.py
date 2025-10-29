"""ENS verification utilities."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from web3 import Web3
from web3.middleware import geth_poa_middleware

_LOGGER = logging.getLogger(__name__)


@dataclass
class ENSVerificationResult:
    domain: str
    expected_owner: str
    resolved_owner: Optional[str]
    verified: bool
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "domain": self.domain,
            "expected_owner": self.expected_owner,
            "resolved_owner": self.resolved_owner,
            "verified": self.verified,
            "error": self.error,
        }


class ENSVerifier:
    """Verifies ENS subdomain ownership before enabling capabilities."""

    def __init__(self, rpc_url: str) -> None:
        self.web3 = Web3(Web3.HTTPProvider(rpc_url))
        # Support POA networks without extra configuration
        self.web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        if not self.web3.is_connected():
            raise ConnectionError("Unable to connect to Ethereum provider for ENS verification")
        self.ens = self.web3.ens

    def verify(self, domain: str, expected_owner: str) -> ENSVerificationResult:
        expected_owner = Web3.to_checksum_address(expected_owner)
        try:
            resolved_owner = self.ens.address(domain)
        except Exception as exc:  # noqa: BLE001 - we want to capture any ENS resolution issue
            _LOGGER.exception("ENS resolution failed", extra={"domain": domain})
            return ENSVerificationResult(domain, expected_owner, None, False, str(exc))

        if resolved_owner is None:
            message = "ENS domain has no resolved address"
            _LOGGER.error(message, extra={"domain": domain})
            return ENSVerificationResult(domain, expected_owner, None, False, message)

        verified = Web3.to_checksum_address(resolved_owner) == expected_owner
        _LOGGER.info(
            "ENS verification result",
            extra={
                "domain": domain,
                "expected_owner": expected_owner,
                "resolved_owner": resolved_owner,
                "verified": verified,
            },
        )
        return ENSVerificationResult(domain, expected_owner, resolved_owner, verified)
