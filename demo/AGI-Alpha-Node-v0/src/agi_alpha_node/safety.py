from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict

from .blockchain import BlockchainClient
from .config import Config
from .logging_utils import json_log


@dataclass
class SafetySnapshot:
    ens_verified: bool
    stake_sufficient: bool
    paused: bool
    governance_address: str


class SafetyController:
    def __init__(self, config: Config, blockchain: BlockchainClient) -> None:
        self.config = config
        self.blockchain = blockchain

    def collect_snapshot(self) -> SafetySnapshot:
        snapshot = SafetySnapshot(
            ens_verified=self.blockchain.verify_ens_domain(),
            stake_sufficient=self.blockchain.ensure_minimum_stake(),
            paused=self.blockchain.is_paused(),
            governance_address=self.blockchain.get_governance_address(),
        )
        json_log("safety_snapshot", **snapshot.__dict__)
        if self.config.safety.enable_auto_pause and not snapshot.stake_sufficient:
            self.blockchain.pause("Stake below required threshold")
        return snapshot

    def enforce(self) -> None:
        snapshot = self.collect_snapshot()
        if not snapshot.ens_verified:
            self.blockchain.pause("ENS verification failed")
        if snapshot.paused:
            json_log("safety_pause_active", reason="policy")


class AntifragilityDrillRunner:
    def __init__(self, config: Config, blockchain: BlockchainClient | None = None) -> None:
        self.config = config
        self.blockchain = blockchain

    def _require_blockchain(self) -> BlockchainClient:
        if self.blockchain is None:
            raise RuntimeError("AntifragilityDrillRunner requires a blockchain client")
        return self.blockchain

    def run_all(self) -> Dict[str, object]:
        client = self._require_blockchain()
        baseline = client.export_state()
        results: Dict[str, object] = {"timestamp": time.time(), "drills": []}

        try:
            # Drill 1: Slashing resilience
            post_slash = client.simulate_slash(self.config.safety.slashing_threshold)
            results["drills"].append({"drill": "slashing", "stake": post_slash})

            # Drill 2: ENS revocation handling
            client.simulate_ens_revocation()
            ens_ok = client.verify_ens_domain()
            results["drills"].append({"drill": "ens_revocation", "verified": ens_ok})

            # Drill 3: Pause/Resume
            client.pause("drill_pause")
            client.resume()
            results["drills"].append({"drill": "pause_resume", "paused": client.is_paused()})

        finally:
            client.load_state(baseline)
        json_log("antifragility_drills", results=results)
        return results
