from __future__ import annotations

from meta_agentic_demo.config import RewardPolicy, StakePolicy
from meta_agentic_demo.entities import Job
from meta_agentic_demo.ledger import RewardEngine, StakeManager, ValidationModule


def make_job(job_id: int = 1) -> Job:
    return Job(
        job_id=job_id,
        title="test",
        description="",
        reward=100.0,
        stake_required=50.0,
    )


def test_commit_reveal_roundtrip() -> None:
    job = make_job()
    module = ValidationModule(quorum=2)
    payload = {"score": 0.9}
    digest = job.commit_result(payload)
    module.commit_result(job, "node-1", digest)
    module.submit_vote(job, "validator-a", digest, approve=True)
    module.submit_vote(job, "validator-b", digest, approve=True)
    assert module.finalise(job) is True
    assert job.status.name == "COMPLETED"


def test_reward_engine_distributes_tokens() -> None:
    engine = RewardEngine(RewardPolicy(total_reward=500.0, temperature=1.2))
    job = make_job()
    rewards = engine.allocate(
        job,
        solver_energy={"node-1": 10.0, "node-2": 5.0},
        validator_energy={"validator-a": 3.0},
    )
    total_allocated = sum(rewards.solver_rewards.values()) + sum(
        rewards.validator_rewards.values()
    ) + rewards.architect_reward
    assert abs(total_allocated - rewards.total_reward) < 1e-6


def test_stake_manager_enforces_inactivity_slash() -> None:
    policy = StakePolicy(minimum_stake=100.0, slash_fraction=0.2)
    manager = StakeManager(policy)
    account = manager.ensure_account("node-1")
    account.last_active = account.last_active.replace(year=2000)
    penalties = manager.enforce_timeouts()
    assert penalties["node-1"] == 20.0
    assert manager.accounts["node-1"].balance == 80.0
