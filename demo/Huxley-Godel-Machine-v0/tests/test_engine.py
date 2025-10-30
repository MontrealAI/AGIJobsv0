from __future__ import annotations

import random
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.append(str(PACKAGE_ROOT))

from src.configuration import DemoConfiguration
from src.engine import HGMEngine, SimulationEnvironment
from src.thermostat import Thermostat
from src.sentinel import Sentinel
from src.baseline import GreedyBaseline


CONFIG_PATH = "demo/Huxley-Godel-Machine-v0/config/default_config.yaml"


def create_engine(seed: int = 1234) -> HGMEngine:
    config = DemoConfiguration.load(Path(CONFIG_PATH))
    rng = random.Random(seed)
    simulation = SimulationEnvironment(config.simulation, rng)
    engine = HGMEngine(config, rng, simulation)
    engine.seed_root(
        config.initial_agent.label,
        config.initial_agent.description,
        config.initial_agent.base_quality,
    )
    return engine

def test_clade_updates_propagate_to_parent():
    config = DemoConfiguration.load(Path(CONFIG_PATH))
    rng = random.Random(42)
    simulation = SimulationEnvironment(config.simulation, rng)
    engine = HGMEngine(config, rng, simulation)
    root = engine.seed_root(config.initial_agent.label, config.initial_agent.description, 0.6)
    child = engine.expand_agent(root.identifier)
    engine.evaluate_agent(child.identifier)
    assert root.clade_attempts == child.attempts


def test_thermostat_adjusts_parameters():
    engine = create_engine()
    thermostat = Thermostat(engine.config.thermostat, engine)
    for roi in [0.5, 0.6, 0.7, 0.8]:
        thermostat.observe(roi)
    thermostat.adjust()
    assert engine.hgm_config.tau < engine.config.hgm.tau
    assert engine.concurrency_limit == engine.config.hgm.min_concurrency


def test_sentinel_blocks_expansions_when_roi_too_low():
    engine = create_engine()
    sentinel = Sentinel(engine.config.sentinel, engine)
    engine.ledger.cost = engine.config.sentinel.cost_ceiling - 1
    engine.ledger.gmv = 0.1
    sentinel_state = sentinel.inspect()
    assert not sentinel_state.expansions_allowed
    assert engine.hgm_config.allow_expansions is False


def test_baseline_runs_and_returns_metrics():
    config = DemoConfiguration.load(Path(CONFIG_PATH))
    baseline = GreedyBaseline(
        config.baseline,
        config.simulation,
        random.Random(999),
        root_quality=config.initial_agent.base_quality,
        label=config.initial_agent.label,
    )
    state = baseline.run(5)
    assert state.ledger.cost > 0
    assert len(state.agents) >= 1


def test_best_agent_selection_is_deterministic():
    engine = create_engine(seed=777)
    for _ in range(10):
        decision = engine.next_decision()
        if decision and decision.action == "expand":
            engine.expand_agent(decision.agent_id)
        elif decision:
            engine.evaluate_agent(decision.agent_id)
        engine.increment_iteration()
    best_first = engine.best_agent()
    engine2 = create_engine(seed=777)
    for _ in range(10):
        decision = engine2.next_decision()
        if decision and decision.action == "expand":
            engine2.expand_agent(decision.agent_id)
        elif decision:
            engine2.evaluate_agent(decision.agent_id)
        engine2.increment_iteration()
    best_second = engine2.best_agent()
    assert best_first.identifier == best_second.identifier
