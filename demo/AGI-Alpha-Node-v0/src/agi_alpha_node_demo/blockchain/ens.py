"""ENS verification logic."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from .client import BlockchainClient

LOGGER = logging.getLogger(__name__)


@dataclass
class ENSVerificationResult:
    domain: str
    expected_owner: str
    actual_owner: str | None
    verified: bool

    def as_dict(self) -> dict:
        return {
            "domain": self.domain,
            "expected_owner": self.expected_owner,
            "actual_owner": self.actual_owner,
            "verified": self.verified,
        }


class ENSVerifier:
    """Verify ENS subdomain ownership before enabling the node."""

    def __init__(self, client: BlockchainClient, domain: str, expected_owner: str) -> None:
        self._client = client
        self._domain = domain
        self._expected_owner = expected_owner.lower()

    def verify(self) -> ENSVerificationResult:
        owner = self._client.ens_owner(self._domain)
        verified = owner is not None and owner.lower() == self._expected_owner
        LOGGER.info(
            "ENS verification for %s – expected=%s actual=%s verified=%s",
            self._domain,
            self._expected_owner,
            owner,
            verified,
        )
        return ENSVerificationResult(
            domain=self._domain,
            expected_owner=self._expected_owner,
            actual_owner=owner,
            verified=verified,
        )
