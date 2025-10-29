"""ENS verification logic."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from eth_utils import to_checksum_address
from web3 import Web3
from web3.exceptions import BadFunctionCallOutput

from .config import ENSConfig

LOGGER = logging.getLogger("agi_alpha_node")


@dataclass
class ENSVerificationResult:
    """Represents the outcome of an ENS verification attempt."""

    success: bool
    resolved_address: Optional[str]
    reason: Optional[str] = None

    def require_success(self) -> None:
        if not self.success:
            raise PermissionError(self.reason or "ENS verification failed")


class ENSVerifier:
    """Verify ENS ownership against on-chain or offline data."""

    def __init__(self, config: ENSConfig, base_path: Optional[Path] | None = None):
        self.config = config
        self._base_path = base_path or Path.cwd()
        self._web3: Optional[Web3] = None
        if config.provider_url:
            self._web3 = Web3(Web3.HTTPProvider(config.provider_url))

    def verify(self) -> ENSVerificationResult:
        LOGGER.info("Starting ENS verification", extra={"event": "ens_verification"})
        on_chain = self._verify_on_chain()
        if on_chain:
            LOGGER.info(
                "ENS verified via on-chain registry",
                extra={"event": "ens_verified", "data": {"address": on_chain}},
            )
            return ENSVerificationResult(True, on_chain)

        fallback = self._verify_fallback()
        if fallback:
            LOGGER.warning(
                "Using fallback ENS registry",
                extra={"event": "ens_verified_fallback", "data": {"address": fallback}},
            )
            return ENSVerificationResult(True, fallback)

        reason = "Unable to verify ENS ownership on-chain or via fallback registry"
        LOGGER.error(reason, extra={"event": "ens_verification_failed"})
        return ENSVerificationResult(False, None, reason)

    def _verify_on_chain(self) -> Optional[str]:
        if not self._web3:
            return None
        try:
            checksum = to_checksum_address(self.config.operator_address)
        except ValueError as err:
            LOGGER.error("Operator address invalid", extra={"event": "ens_invalid_operator"})
            raise ValueError("Invalid operator address") from err
        try:
            resolved = self._web3.ens.address(self.config.name)
        except BadFunctionCallOutput:
            LOGGER.error("ENS resolution failed", extra={"event": "ens_resolution_failed"})
            return None
        if resolved and to_checksum_address(resolved) == checksum:
            return resolved
        LOGGER.warning(
            "ENS resolution mismatch",
            extra={
                "event": "ens_mismatch",
                "data": {"resolved": resolved, "expected": checksum},
            },
        )
        return None

    def _verify_fallback(self) -> Optional[str]:
        if not self.config.fallback_registry_file:
            return None
        path = self._base_path / Path(self.config.fallback_registry_file)
        if not path.exists():
            LOGGER.warning("Fallback registry missing", extra={"event": "ens_no_fallback"})
            return None
        data = json.loads(path.read_text())
        resolved = data.get(self.config.name)
        if resolved and to_checksum_address(resolved) == to_checksum_address(self.config.operator_address):
            return resolved
        LOGGER.warning(
            "Fallback registry mismatch",
            extra={"event": "ens_fallback_mismatch", "data": {"resolved": resolved}},
        )
        return None


__all__ = ["ENSVerifier", "ENSVerificationResult"]
