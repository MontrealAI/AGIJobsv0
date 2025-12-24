from __future__ import annotations

from datetime import datetime, timedelta, timezone

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import (
    JobRecord,
    JobSpec,
    JobStatus,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)


def _make_job(reward_pool: float, *, employer: str = "operator") -> JobRecord:
    now = datetime.now(timezone.utc)
    spec = JobSpec(
        title="Test job",
        description="Validator reward distribution test.",
        required_skills=["validation"],
        reward_tokens=100.0,
        deadline=now + timedelta(hours=1),
        validation_window=timedelta(minutes=5),
        metadata={"employer": employer},
    )
    return JobRecord(
        job_id="job-1",
        spec=spec,
        status=JobStatus.COMPLETED,
        created_at=now,
        validator_reward_pool=reward_pool,
    )


def test_validator_rewards_distributed_to_approvers() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=False))
    job = _make_job(12.0)
    job.validator_votes = {
        "validator-1": True,
        "validator-2": True,
        "validator-3": False,
    }
    for validator in job.validator_votes:
        orchestrator.resources.ensure_account(validator)

    distributed = orchestrator._distribute_validator_rewards(job)

    assert distributed == 12.0
    assert job.validator_reward_pool == 0.0
    assert orchestrator.resources.get_account("validator-1").tokens == 6.0
    assert orchestrator.resources.get_account("validator-2").tokens == 6.0
    assert orchestrator.resources.get_account("validator-3").tokens == 0.0


def test_validator_reward_pool_refunded_to_employer() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=False))
    job = _make_job(7.5, employer="chief-operator")
    orchestrator.resources.ensure_account("chief-operator")

    refunded = orchestrator._refund_validator_reward_pool(job, reason="unit-test")

    assert refunded == 7.5
    assert job.validator_reward_pool == 0.0
    assert orchestrator.resources.get_account("chief-operator").tokens == 7.5
