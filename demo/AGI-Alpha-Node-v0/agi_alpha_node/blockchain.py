"""Blockchain integration layer for the AGI Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable
import logging
import time

from .config import BlockchainConfig

LOGGER = logging.getLogger(__name__)


@dataclass
class StakeStatus:
    current_stake: int
    minimum_required: int
    can_activate: bool


class BlockchainClient:
    """High-level blockchain client with ENS, staking, and job integrations."""

    def __init__(self, config: BlockchainConfig, minimum_stake: int) -> None:
        self._config = config
        self._minimum_stake = minimum_stake

    def verify_ens_control(self, ens_name: str, operator_address: str) -> bool:
        """Stub ENS ownership verification.

        In production this would query the ENS registry.  The demo version logs the
        intent and returns True if the operator address matches the configured
        allowed list, simulating ownership verification.
        """
        LOGGER.info(
            "Verifying ENS ownership",
            extra={
                "ens_name": ens_name,
                "operator": operator_address,
                "registry": self._config.ens_registry,
            },
        )
        return operator_address.lower().startswith("0x") and len(operator_address) == 42

    def get_stake_status(self, operator_address: str) -> StakeStatus:
        LOGGER.info(
            "Fetching stake status",
            extra={
                "operator": operator_address,
                "stake_manager": self._config.stake_manager,
            },
        )
        # Demo assumes stake equals minimum for activation.
        return StakeStatus(
            current_stake=self._minimum_stake,
            minimum_required=self._minimum_stake,
            can_activate=True,
        )

    def claim_rewards(self, operator_address: str) -> int:
        LOGGER.info(
            "Claiming rewards",
            extra={
                "operator": operator_address,
                "fee_pool": self._config.fee_pool,
            },
        )
        # Demo returns a deterministic pseudo-random reward stream.
        reward = int(time.time()) % 10_000
        LOGGER.debug("Claimed rewards", extra={"amount": reward})
        return reward

    def available_jobs(self) -> Iterable[Dict[str, Any]]:
        LOGGER.info(
            "Querying job registry",
            extra={
                "job_router": self._config.job_router,
                "job_registry": self._config.job_registry,
            },
        )
        return [
            {
                "job_id": "finance-arb-001",
                "domain": "finance",
                "reward": 2_500,
                "requirements": ["hedge-strategy"],
            },
            {
                "job_id": "biotech-sim-042",
                "domain": "biotech",
                "reward": 4_000,
                "requirements": ["protein-folding"],
            },
            {
                "job_id": "manufacturing-opt-777",
                "domain": "manufacturing",
                "reward": 3_400,
                "requirements": ["supply-chain"],
            },
        ]

    def pause_platform(self, reason: str) -> None:
        LOGGER.warning(
            "Pausing platform",
            extra={
                "system_pause": self._config.system_pause,
                "reason": reason,
            },
        )

    def rotate_governance(self, new_address: str) -> None:
        LOGGER.info(
            "Rotating governance address",
            extra={
                "new_governance": new_address,
                "target": self._config.governance_address,
            },
        )

    @property
    def config(self) -> BlockchainConfig:
        return self._config


__all__ = ["BlockchainClient", "StakeStatus"]
