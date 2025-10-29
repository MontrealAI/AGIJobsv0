from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Iterable

from .config import SystemConfig


@dataclass
class JobResult:
    job_id: str
    outcome_hash: str
    execution_digest: str


@dataclass
class BatchProof:
    job_count: int
    digest: str
    proof: str
    gas_saved: int


class ZKBatchAttestor:
    def __init__(self, config: SystemConfig) -> None:
        self.config = config

    def _digest_jobs(self, jobs: Iterable[JobResult]) -> str:
        aggregate = hashlib.sha3_256()
        for job in jobs:
            aggregate.update(job.job_id.encode())
            aggregate.update(job.outcome_hash.encode())
            aggregate.update(job.execution_digest.encode())
        return aggregate.hexdigest()

    def create_batch_proof(self, jobs: Iterable[JobResult]) -> BatchProof:
        job_list = list(jobs)
        if not job_list:
            raise ValueError("no jobs provided")
        if len(job_list) > self.config.batch_proof_capacity:
            raise ValueError("job batch exceeds attestation capacity")
        digest = self._digest_jobs(job_list)
        proof = hashlib.sha3_256(f"{self.config.proving_key}:{digest}".encode()).hexdigest()
        gas_saved = self.estimate_gas_saved(len(job_list))
        return BatchProof(len(job_list), digest, proof, gas_saved)

    def verify_batch_proof(self, jobs: Iterable[JobResult], proof: BatchProof) -> bool:
        job_list = list(jobs)
        if len(job_list) != proof.job_count:
            return False
        digest = self._digest_jobs(job_list)
        if digest != proof.digest:
            return False
        expected_proof = hashlib.sha3_256(f"{self.config.proving_key}:{digest}".encode()).hexdigest()
        if expected_proof != proof.proof:
            return False
        return True

    def estimate_gas_saved(self, job_count: int) -> int:
        return job_count * self.config.gas_saved_per_job
