"""Zero-knowledge batch attestation simulator."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import blake2b
from typing import Iterable, List

from .config import SystemConfig


@dataclass(slots=True, frozen=True)
class JobResult:
    job_id: str
    outcome_hash: str
    execution_digest: str


@dataclass(slots=True, frozen=True)
class BatchProof:
    batch_root: str
    job_count: int
    circuit_hash: str


class ZKBatchAttestor:
    """Aggregates job results into a single verifiable proof."""

    def __init__(self, config: SystemConfig) -> None:
        self.config = config

    def _hash_job(self, job: JobResult) -> bytes:
        hasher = blake2b(digest_size=32)
        hasher.update(job.job_id.encode())
        hasher.update(job.outcome_hash.encode())
        hasher.update(job.execution_digest.encode())
        return hasher.digest()

    def create_batch_proof(self, jobs: Iterable[JobResult], circuit_hash: str = "constellation-v1") -> BatchProof:
        jobs_list = list(jobs)
        if not jobs_list:
            raise ValueError("Cannot create proof for empty job list")
        if len(jobs_list) > self.config.batch_proof_capacity:
            raise ValueError("Job count exceeds batch capacity")
        hasher = blake2b(digest_size=32)
        for job in jobs_list:
            hasher.update(self._hash_job(job))
        batch_root = hasher.hexdigest()
        return BatchProof(batch_root=batch_root, job_count=len(jobs_list), circuit_hash=circuit_hash)

    def verify_batch_proof(self, jobs: Iterable[JobResult], proof: BatchProof) -> bool:
        reconstructed = self.create_batch_proof(jobs, circuit_hash=proof.circuit_hash)
        return reconstructed == proof

    def estimate_gas_saved(self, jobs: int) -> int:
        single_tx_cost = 210_000
        zk_tx_cost = 350_000
        return max((single_tx_cost * jobs) - zk_tx_cost, 0)
