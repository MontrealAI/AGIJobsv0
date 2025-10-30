"""Blockchain primitives for the AGI Alpha Node demo."""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Optional

from web3 import Web3

LOGGER = logging.getLogger("agi_alpha_node_demo.blockchain")


@dataclass
class EnsVerificationResult:
    domain: str
    owner: str
    resolved: bool


@dataclass
class StakeStatus:
    minimum_required: Decimal
    current: Decimal
    is_active: bool


class BlockchainError(RuntimeError):
    pass


class BlockchainClient:
    """Thin wrapper around Web3 for the demo.

    The client is purposely opinionated: it provides guard rails for ENS verification,
    staking checks, reward tracking, and pause control.  Real deployments should swap in
    production contract ABIs but can retain this interface for simplicity.
    """

    def __init__(self, endpoint: str, chain_id: int, ens_registry: str) -> None:
        self.endpoint = endpoint
        self.chain_id = chain_id
        self.web3 = Web3(Web3.HTTPProvider(endpoint, request_kwargs={"timeout": 15}))
        self.ens_registry = ens_registry
        self._ens_cache: Dict[str, EnsVerificationResult] = {}
        self._stake_status: Optional[StakeStatus] = None
        LOGGER.debug("Blockchain client initialised", extra={"endpoint": endpoint})

    def check_connection(self) -> bool:
        try:
            return bool(self.web3.is_connected())
        except Exception as exc:  # pragma: no cover - defensive logging
            LOGGER.warning("Web3 connection check failed", exc_info=exc)
            return False

    # --- ENS -----------------------------------------------------------------
    def verify_ens_domain(self, domain: str, expected_owner: str) -> EnsVerificationResult:
        if domain in self._ens_cache:
            return self._ens_cache[domain]

        if not self.check_connection():
            LOGGER.info("Falling back to offline ENS verification for %s", domain)
            result = EnsVerificationResult(domain=domain, owner=expected_owner, resolved=True)
        else:
            # Use web3 to resolve ENS owner.  For demo we simulate success while logging.
            checksum_owner = Web3.to_checksum_address(expected_owner)
            result = EnsVerificationResult(domain=domain, owner=checksum_owner, resolved=True)
        self._ens_cache[domain] = result
        LOGGER.info("ENS verification succeeded", extra={"domain": domain, "owner": result.owner})
        return result

    # --- Staking --------------------------------------------------------------
    def update_stake(self, minimum_required: Decimal, current: Decimal) -> StakeStatus:
        status = StakeStatus(
            minimum_required=minimum_required,
            current=current,
            is_active=current >= minimum_required,
        )
        self._stake_status = status
        LOGGER.info(
            "Stake status updated",
            extra={"minimum": float(minimum_required), "current": float(current)},
        )
        if not status.is_active:
            raise BlockchainError("Stake below minimum activation threshold")
        return status

    def accrue_rewards(self) -> Decimal:
        if not self._stake_status:
            raise BlockchainError("Stake status unknown; call update_stake first")
        base = float(self._stake_status.current)
        delta = Decimal(base * random.uniform(0.001, 0.01))
        LOGGER.debug("Rewards accrued", extra={"amount": float(delta)})
        return delta.quantize(Decimal("0.0001"))

    # --- Pause Control --------------------------------------------------------
    def broadcast_pause(self) -> str:
        tx_hash = f"0x{random.getrandbits(256):064x}"
        LOGGER.warning("Pause transaction simulated", extra={"tx_hash": tx_hash})
        return tx_hash

    def broadcast_resume(self) -> str:
        tx_hash = f"0x{random.getrandbits(256):064x}"
        LOGGER.info("Resume transaction simulated", extra={"tx_hash": tx_hash})
        return tx_hash

    # --- Jobs -----------------------------------------------------------------
    def fetch_available_jobs(self) -> Dict[str, Dict[str, str]]:
        """Return a simulated job ledger for the planner to evaluate."""
        now = int(time.time())
        jobs = {
            f"finance-{now}": {"type": "finance", "value": "Treasury rebalancing"},
            f"biotech-{now}": {"type": "biotech", "value": "Protein synthesis"},
            f"manufacturing-{now}": {"type": "manufacturing", "value": "Factory optimisation"},
        }
        LOGGER.debug("Fetched %d jobs", len(jobs))
        return jobs

    def submit_job_result(self, job_id: str, payload: Dict[str, str]) -> str:
        tx_hash = f"0x{random.getrandbits(256):064x}"
        LOGGER.info("Submitted job result", extra={"job_id": job_id, "tx_hash": tx_hash, "payload": payload})
        return tx_hash
