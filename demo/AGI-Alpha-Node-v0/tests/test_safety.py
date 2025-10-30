from pathlib import Path

from alpha_node.config import AlphaNodeConfig
from alpha_node.ens import ENSVerifier
from alpha_node.governance import GovernanceController
from alpha_node.safety import SafetyController
from alpha_node.stake import StakeManager
from alpha_node.state import StateStore


def _build_env(tmp_path):
    config = AlphaNodeConfig.load(Path('demo/AGI-Alpha-Node-v0/config.toml'))
    state = StateStore(tmp_path / 'state.json')
    stake_manager = StakeManager(config.stake, state, tmp_path / 'ledger.csv')
    registry = tmp_path / 'ens_registry.csv'
    registry.write_text(f"{config.ens.domain},{config.ens.owner_address}\n", encoding='utf-8')
    ens_verifier = ENSVerifier(config.ens, registry)
    governance = GovernanceController(config.governance, state)
    safety = SafetyController(state, stake_manager, ens_verifier, governance)
    return config, state, stake_manager, ens_verifier, governance, safety


def test_guard_pauses_when_stake_missing(tmp_path):
    _, state, _, _, _, safety = _build_env(tmp_path)
    evaluation = safety.guard('activation', auto_resume=False)
    assert evaluation.safe is False
    paused_state = state.read()
    assert paused_state.paused is True
    assert paused_state.pause_reason.startswith('safety:activation:stake')
    assert paused_state.last_safety_violation.startswith('safety:activation:stake')


def test_guard_allows_operations_after_recovery(tmp_path):
    config, state, stake_manager, _, _, safety = _build_env(tmp_path)
    safety.guard('activation', auto_resume=False)
    stake_manager.deposit(config.stake.minimum_stake)
    evaluation = safety.guard('activation')
    assert evaluation.safe is True
    assert state.read().paused is False


def test_manual_pause_is_respected(tmp_path):
    config, state, stake_manager, _, governance, safety = _build_env(tmp_path)
    stake_manager.deposit(config.stake.minimum_stake)
    governance.pause_all('operator-request')
    evaluation = safety.guard('run-cycle')
    assert evaluation.safe is False
    assert state.read().pause_reason == 'operator-request'
    assert state.read().last_safety_violation == ''


def test_conduct_drill_improves_antifragility(tmp_path):
    _, state, stake_manager, _, _, safety = _build_env(tmp_path)
    stake_manager.deposit(100)
    before = state.read().antifragility_index
    safety.conduct_drill()
    after = state.read().antifragility_index
    assert after >= before
