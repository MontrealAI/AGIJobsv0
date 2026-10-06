from __future__ import annotations
import json
import math
import subprocess
import sys
from datetime import timedelta
from pathlib import Path
import pytest
from meta_agentic_demo.config import DemoConfig, DemoScenario, DatasetProfile, EvolutionPolicy, RewardPolicy, StakePolicy, VerificationPolicy
from meta_agentic_demo.admin import OwnerConsole
from meta_agentic_demo.evolutionary import EvolutionaryProgramSynthesizer
from meta_agentic_demo.entities import Job
from meta_agentic_demo.governance import GovernanceTimelock
from meta_agentic_demo.ledger import StakeAccount, StakeManager, RewardEngine, ValidationModule
from meta_agentic_demo.orchestrator import SovereignArchitect
from meta_agentic_demo.report import render_html, render_batch_html, _summarise_batch

ROOT = Path(__file__).resolve().parents[2]

@pytest.mark.parametrize('seed', range(12))
def test_winner_is_exactly_the_last_reported_candidate(seed):
    model = EvolutionaryProgramSynthesizer(6, 2, .9, .5, seed)
    score = lambda p: sum(p) / 10
    winner, history = model.evolve(3, score)
    assert score(winner) == history[-1].best_score
    assert model.render_program(winner) == history[-1].winning_program
    assert len(history) == 3

@pytest.mark.parametrize('factory', [
    lambda: RewardPolicy(total_reward=math.nan), lambda: RewardPolicy(temperature=math.inf),
    lambda: RewardPolicy(total_reward=True), lambda: StakePolicy(minimum_stake=-1),
    lambda: EvolutionPolicy(generations=1.5), lambda: EvolutionPolicy(elite_count=0),
    lambda: EvolutionPolicy(generations=1000, population_size=1000),
    lambda: VerificationPolicy(bootstrap_iterations=1.5), lambda: VerificationPolicy(residual_mean_tolerance=math.nan),
    lambda: DatasetProfile(length=10000), lambda: DatasetProfile(noise=math.inf),
    lambda: DemoScenario('../escape', 'bad', '', 'score', .5),
])
def test_configuration_fails_before_execution(factory):
    with pytest.raises(ValueError): factory()

@pytest.mark.parametrize('args', [
    ['unknown'], ['alpha', '--reward-total', 'nan'], ['alpha', '--evolution-elite', '0'],
    ['alpha', '--timelock-delay', '-1'], ['--scenario-json', '{bad'],
    ['--scenario-json', '{"identifier":"../bad","target_metric":"score","success_threshold":0.5}'],
])
def test_cli_failure_is_nonzero_and_writes_no_success_report(tmp_path, args):
    run = subprocess.run([sys.executable, str(ROOT/'run_demo.py'), *args, '--output', str(tmp_path)], capture_output=True, text=True)
    assert run.returncode != 0
    assert not (tmp_path/'report.json').exists()


def test_zero_slash_and_invalid_stake_mutations():
    manager = StakeManager(StakePolicy(minimum_stake=100))
    assert manager.slash('worker', 0) == 0
    account = manager.accounts['worker']
    for value in [-1, math.nan, math.inf, True]:
        for action in [account.deposit, account.withdraw, account.slash]:
            with pytest.raises(ValueError): action(value)
            assert account.balance == 100


def test_reward_allocation_is_stable_and_requires_recipients():
    engine = RewardEngine(RewardPolicy(temperature=1e-9))
    job = Job(1, 'test', '', 1000, 0)
    result = engine.allocate(job, {'a':10,'b':0}, {'v':1})
    assert sum(result.solver_rewards.values()) + sum(result.validator_rewards.values()) + result.architect_reward == pytest.approx(1000)
    with pytest.raises(ValueError): engine.allocate(job, {}, {'v':1})


def test_solver_cannot_self_review_or_rewrite_votes():
    job = Job(1, 'test', '', 1000, 0)
    module = ValidationModule(2)
    digest = job.commit_result({'score':.5})
    with pytest.raises(ValueError): module.submit_vote(job, 'v1', digest, True)
    module.commit_result(job, 'worker', digest)
    with pytest.raises(ValueError): module.submit_vote(job, 'worker', digest, True)
    module.submit_vote(job, 'v1', digest, True)
    with pytest.raises(ValueError): module.submit_vote(job, 'v1', digest, True)
    assert module.finalise(job) is False
    with pytest.raises(ValueError): module.submit_vote(job, 'v2', digest, True)


def test_reveal_does_not_bypass_validation():
    job = Job(1, 'test', '', 1000, 0)
    digest = job.commit_result({'score':.5})
    job.reveal_result(digest)
    assert job.status.name == 'IN_PROGRESS'
    assert not ValidationModule().finalise(job)


def test_timelock_explicit_zero_and_boolean_controls():
    console = OwnerConsole(DemoConfig())
    clock = GovernanceTimelock(timedelta(seconds=100))
    clock.schedule('pause', {}, delay=timedelta(0))
    clock.execute_due(console)
    assert console.is_paused
    with pytest.raises(ValueError): console.set_paused('false')
    with pytest.raises(ValueError): clock.schedule('resume', {}, delay=timedelta(seconds=-1))


def test_report_evidence_and_escaping():
    scenario = DemoScenario('safe', '<script>attack()</script>', '', 'score', .5)
    artifacts = SovereignArchitect(DemoConfig()).run(scenario)
    payload = artifacts.to_dict()
    assert payload['evidence_class'] == 'seeded-simulation'
    assert not payload['settlement_approved']
    html = render_html(artifacts)
    assert '<script>attack()</script>' not in html
    assert 'Job #1' in html and 'Job #{job_id}' not in html
    assert 'Jobs Posted (12)' in html
    assert 'simulation credits' in html
    batch = render_batch_html({'safe':artifacts}, _summarise_batch({'safe':artifacts}), {}, Path('/tmp'), None)
    assert '<script>attack()</script>' not in batch
