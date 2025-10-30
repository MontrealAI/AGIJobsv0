"""Job registry and router integration."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

from .client import BlockchainClient, MockBlockchainClient

LOGGER = logging.getLogger(__name__)


@dataclass
class Job:
    job_id: str
    domain: str
    reward: float
    payload: Dict[str, Any]


class JobRegistry:
    """Interface with the on-chain job registry and router."""

    def __init__(self, client: BlockchainClient) -> None:
        self._client = client
        self._router = None
        self._registry = None
        if not isinstance(client, MockBlockchainClient):
            self._router = client.get_contract("job_router")
            self._registry = client.get_contract("job_registry")

    def fetch_jobs(self) -> Iterable[Job]:
        if isinstance(self._client, MockBlockchainClient):
            for record in self._client.list_jobs():
                yield Job(
                    job_id=record["id"],
                    domain=record["domain"],
                    reward=float(record.get("reward", 0)),
                    payload=record,
                )
            return

        assert self._router is not None and self._registry is not None
        job_count = int(self._registry.functions.jobCount().call())
        for job_index in range(job_count):  # pragma: no cover - depends on live chain state
            job_meta = self._registry.functions.jobs(job_index).call()
            job_id = job_meta[0]
            domain = job_meta[1]
            reward = float(job_meta[3])
            payload = {"raw": job_meta}
            yield Job(job_id=job_id, domain=domain, reward=reward, payload=payload)

    def claim_job(self, job: Job, worker: str) -> str:
        LOGGER.info("Claiming job %s for %s", job.job_id, worker)
        if isinstance(self._client, MockBlockchainClient):
            return f"mock-tx-{job.job_id}"
        assert self._router is not None
        tx = self._client.transact(
            self._router,
            "claimJob",
            {"from": worker},
            job.job_id,
        )
        return tx

    def submit_job(self, job: Job, worker: str, result_uri: str) -> str:
        LOGGER.info("Submitting job %s result=%s", job.job_id, result_uri)
        if isinstance(self._client, MockBlockchainClient):
            return f"mock-submission-{job.job_id}"
        assert self._router is not None
        tx = self._client.transact(
            self._router,
            "submitJobResult",
            {"from": worker},
            job.job_id,
            result_uri,
        )
        return tx

    def jobs_by_domain(self, domain: str) -> List[Job]:
        return [job for job in self.fetch_jobs() if job.domain == domain]
