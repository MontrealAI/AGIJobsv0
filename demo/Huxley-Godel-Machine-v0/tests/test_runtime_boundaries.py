import json
import math
import random
from pathlib import Path

import pytest

from demo.huxley_godel_machine_v0.simulator import run_simulation
from hgm_v0_demo.config_loader import ConfigError, load_config
from hgm_v0_demo.engine import HGMEngine
from hgm_v0_demo.metrics import EconomicSnapshot
from hgm_v0_demo.thermostat import Thermostat, ThermostatConfig

CONFIG = Path('demo/Huxley-Godel-Machine-v0/config/hgm_demo_config.json')

@pytest.mark.parametrize('budget', [1, 18.5, 32, 50, 100, 107.5])
def test_completed_plus_queued_work_never_exceeds_budget(tmp_path, budget):
    for seed in range(4):
        report = run_simulation(config_path=CONFIG, seed=seed, output_dir=tmp_path / str(seed), overrides=[('economics.max_budget', budget), ('hgm.concurrency.evaluation', 8), ('hgm.concurrency.expansion', 8), ('simulation.expansion_latency', [8, 8]), ('simulation.evaluation_latency', [8, 8])])
        for result in (report.hgm, report.baseline):
            assert result.summary.cost + result.summary.reserved_cost <= budget
            assert all(s.cost + s.reserved_cost <= budget for s in result.timeline)

@pytest.mark.parametrize('key,value', [('simulation.report_interval', 0), ('simulation.total_steps', True), ('economics.max_budget', float('nan')), ('economics.evaluation_cost', -1), ('economics.expansion_cost', 0), ('hgm.max_agents', 1.5), ('hgm.epsilon', 1), ('hgm.alpha', float('inf')), ('simulation.evaluation_latency', [2, 1]), ('simulation.expansion_latency', [0, 1, 2]), ('owner_controls.pause_all', 'false'), ('owner_controls.max_actions', True), ('thermostat.min_concurrency', 100), ('economics.budegt', 50)])
def test_invalid_configuration_fails_before_output(tmp_path, key, value):
    with pytest.raises(ConfigError):
        run_simulation(config_path=CONFIG, output_dir=tmp_path / 'absent', overrides=[(key, value)])
    assert not (tmp_path / 'absent').exists()

def test_paused_strategies_do_no_work_and_write_strict_json(tmp_path):
    report = run_simulation(config_path=CONFIG, output_dir=tmp_path, overrides=[('owner_controls.pause_all', True)])
    for result in (report.hgm, report.baseline):
        assert result.summary.gmv == result.summary.cost == result.summary.reserved_cost == 0
    payload = json.loads(report.comparison_artifact_path.read_text(), parse_constant=lambda value: pytest.fail(value))
    assert payload['hgm']['summary']['roi'] is None
    assert payload['production_approved'] is payload['settlement_approved'] is False
    assert payload['provider_calls'] == payload['chain_transactions'] == 0

def test_horizon_keeps_pending_reservations_visible(tmp_path):
    report = run_simulation(config_path=CONFIG, output_dir=tmp_path, overrides=[('simulation.total_steps', 1)])
    assert report.hgm.summary.pending_tasks > 0
    assert report.hgm.summary.reserved_cost > 0
    assert report.hgm.summary.cost == 0

def test_agent_limit_accounts_for_pending_expansions(tmp_path):
    report = run_simulation(config_path=CONFIG, output_dir=tmp_path, overrides=[('hgm.max_agents', 3), ('hgm.concurrency.expansion', 10)])
    for snapshot in report.hgm.timeline:
        assert len(snapshot.agents) + sum(a.inflight_expansions for a in snapshot.agents) <= 3

def test_cli_owner_cap_applies_to_both_strategies(tmp_path):
    report = run_simulation(config_path=CONFIG, output_dir=tmp_path, overrides=[('owner_controls.max_actions', 0)])
    assert report.hgm.summary.cost == report.baseline.summary.cost == 0

def test_thermostat_ignores_undefined_initial_ratios():
    engine = HGMEngine(1, 1, .1, 5, 5, 5, random.Random(1))
    thermostat = Thermostat(engine, ThermostatConfig(2, 2, .1, .1, 1, 8, 1, .1, .1))
    for step in range(3):
        thermostat.observe(EconomicSnapshot(step, 0, 0, 0, 0, math.inf, [], None))
    assert engine.tau == 1
    assert engine.max_evaluation_concurrency == 1
