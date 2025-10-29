"""Job router/registry integration."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Iterable, List

from web3 import Web3
from web3.contract import Contract

from .client import Web3Config, get_web3

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Job:
    job_id: int
    domain: str
    reward: int
    metadata: Dict[str, str]


@dataclass(slots=True)
class JobRegistry:
    config: Web3Config
    contract_address: str
    abi: list

    def _contract(self) -> Contract:
        web3 = get_web3(self.config)
        return web3.eth.contract(address=Web3.to_checksum_address(self.contract_address), abi=self.abi)

    def list_open_jobs(self) -> Iterable[Job]:
        contract = self._contract()
        raw_jobs: List[Dict[str, str]] = contract.functions.listOpenJobs().call()
        for raw in raw_jobs:
            job = Job(
                job_id=int(raw["jobId"]),
                domain=str(raw["domain"]),
                reward=int(raw["reward"]),
                metadata=dict(raw["metadata"]),
            )
            logger.debug("Fetched open job", extra={"job_id": job.job_id, "domain": job.domain})
            yield job

    def build_claim_tx(self, operator: str, job_id: int) -> Dict[str, int]:
        contract = self._contract()
        web3 = get_web3(self.config)
        transaction = contract.functions.claimJob(job_id).build_transaction({
            "from": Web3.to_checksum_address(operator),
            "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(operator)),
            "gas": 350000,
            "gasPrice": web3.eth.gas_price,
        })
        logger.info("Prepared job claim", extra={"operator": operator, "job_id": job_id})
        return transaction

    def build_submit_tx(self, operator: str, job_id: int, artifact_uri: str) -> Dict[str, int]:
        contract = self._contract()
        web3 = get_web3(self.config)
        transaction = contract.functions.submitResult(job_id, artifact_uri).build_transaction({
            "from": Web3.to_checksum_address(operator),
            "nonce": web3.eth.get_transaction_count(Web3.to_checksum_address(operator)),
            "gas": 500000,
            "gasPrice": web3.eth.gas_price,
        })
        logger.info("Prepared job result submission", extra={"operator": operator, "job_id": job_id,
                                                             "artifact": artifact_uri})
        return transaction


__all__ = ["Job", "JobRegistry"]
