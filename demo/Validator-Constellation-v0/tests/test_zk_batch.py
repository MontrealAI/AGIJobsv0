from __future__ import annotations

from validator_constellation.config import SystemConfig
from validator_constellation.zk_batch import BatchProof, JobResult, ZKBatchAttestor


def test_batch_proof_round_trip():
    config = SystemConfig()
    attestor = ZKBatchAttestor(config)
    jobs = [
        JobResult(job_id=f"job-{i}", outcome_hash=f"out::{i % 2}", execution_digest=f"digest::{i}")
        for i in range(1, 1_001)
    ]
    proof = attestor.create_batch_proof(jobs)
    assert proof.job_count == len(jobs)
    assert attestor.verify_batch_proof(jobs, proof)
    assert attestor.estimate_gas_saved(len(jobs)) > 0


def test_batch_capacity_guard():
    config = SystemConfig()
    attestor = ZKBatchAttestor(config)
    jobs = [JobResult(job_id="job-1", outcome_hash="out::1", execution_digest="digest::1")]
    proof = attestor.create_batch_proof(jobs)
    assert isinstance(proof, BatchProof)

    too_many = [
        JobResult(job_id=f"job-{i}", outcome_hash="out", execution_digest="digest")
        for i in range(1, config.batch_proof_capacity + 2)
    ]
    try:
        attestor.create_batch_proof(too_many)
    except ValueError as exc:
        assert "exceeds" in str(exc)
    else:
        raise AssertionError("Expected ValueError when exceeding batch capacity")
