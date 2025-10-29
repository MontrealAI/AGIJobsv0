from __future__ import annotations

from tiny_recursive_model_v0.config import ThermostatConfig, TrmConfig
from tiny_recursive_model_v0.engine import TinyRecursiveModelEngine
from tiny_recursive_model_v0.ledger import EconomicLedger, LedgerEntry
from tiny_recursive_model_v0.thermostat import Thermostat


def make_trm_config() -> TrmConfig:
    return TrmConfig(
        input_dim=4,
        latent_dim=8,
        hidden_dim=12,
        output_dim=2,
        inner_cycles=4,
        outer_steps=3,
        halt_threshold=0.5,
        max_cycles=12,
        ema_decay=0.9,
        learning_rate=0.001,
        weight_decay=0.0001,
        batch_size=8,
        epochs=1,
        device="cpu",
    )


def test_thermostat_increases_when_roi_high():
    trm_config = make_trm_config()
    engine = TinyRecursiveModelEngine.from_config(trm_config)
    ledger = EconomicLedger(value_per_success=100.0, base_compute_cost=0.001, cost_per_cycle=0.0001, daily_budget=10.0)
    thermostat_config = ThermostatConfig(
        target_roi=2.0,
        window=5,
        min_inner_cycles=2,
        max_inner_cycles=6,
        min_outer_steps=2,
        max_outer_steps=5,
        min_halt_threshold=0.4,
        max_halt_threshold=0.9,
        min_concurrency=1,
        max_concurrency=4,
    )
    thermostat = Thermostat(thermostat_config, ledger, engine)

    # Populate ledger with high ROI
    for _ in range(5):
        ledger.entries.append(LedgerEntry(timestamp=0.0, value=100.0, cost=1.0, success=True, cycles_used=5, latency_ms=100.0))

    snapshot = thermostat.update()
    assert snapshot.inner_cycles >= trm_config.inner_cycles
    assert snapshot.outer_steps >= trm_config.outer_steps
    assert snapshot.halt_threshold <= trm_config.halt_threshold


def test_thermostat_decreases_when_roi_low():
    trm_config = make_trm_config()
    engine = TinyRecursiveModelEngine.from_config(trm_config)
    ledger = EconomicLedger(value_per_success=100.0, base_compute_cost=0.001, cost_per_cycle=0.0001, daily_budget=10.0)
    thermostat_config = ThermostatConfig(
        target_roi=2.0,
        window=5,
        min_inner_cycles=2,
        max_inner_cycles=6,
        min_outer_steps=2,
        max_outer_steps=5,
        min_halt_threshold=0.4,
        max_halt_threshold=0.9,
        min_concurrency=1,
        max_concurrency=4,
    )
    thermostat = Thermostat(thermostat_config, ledger, engine)

    # Populate ledger with low ROI
    for _ in range(5):
        ledger.entries.append(LedgerEntry(timestamp=0.0, value=0.0, cost=1.0, success=False, cycles_used=5, latency_ms=100.0))

    snapshot = thermostat.update()
    assert snapshot.inner_cycles <= trm_config.inner_cycles
    assert snapshot.outer_steps <= trm_config.outer_steps
    assert snapshot.halt_threshold >= trm_config.halt_threshold
