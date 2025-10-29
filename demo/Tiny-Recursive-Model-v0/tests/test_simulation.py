from __future__ import annotations

import json
from pathlib import Path

from tiny_recursive_model_v0.config import (
    DemoConfig,
    EthereumConfig,
    LedgerConfig,
    OwnerConfig,
    SentinelConfig,
    TelemetryConfig,
    ThermostatConfig,
    TrmConfig,
)
from tiny_recursive_model_v0.engine import TinyRecursiveModelEngine
from tiny_recursive_model_v0.ledger import EconomicLedger
from tiny_recursive_model_v0.sentinel import Sentinel
from tiny_recursive_model_v0.simulation import ConversionSimulation
from tiny_recursive_model_v0.telemetry import TelemetryWriter
from tiny_recursive_model_v0.thermostat import Thermostat


def _make_demo_config(telemetry_path: Path) -> DemoConfig:
    return DemoConfig(
        owner=OwnerConfig(address="0x1", name="Test Owner"),
        thermostat=ThermostatConfig(
            target_roi=1.5,
            window=5,
            min_inner_cycles=1,
            max_inner_cycles=4,
            min_outer_steps=1,
            max_outer_steps=4,
            min_halt_threshold=0.3,
            max_halt_threshold=0.9,
            min_concurrency=1,
            max_concurrency=2,
        ),
        sentinel=SentinelConfig(
            min_roi=0.5,
            max_daily_cost=5.0,
            max_latency_ms=5000,
            max_total_cycles=20,
            failure_backoff_limit=5,
        ),
        ledger=LedgerConfig(
            value_per_success=25.0,
            base_compute_cost=0.001,
            cost_per_cycle=0.0005,
            daily_budget=5.0,
        ),
        trm=TrmConfig(
            input_dim=6,
            latent_dim=12,
            hidden_dim=18,
            output_dim=2,
            inner_cycles=2,
            outer_steps=3,
            halt_threshold=0.5,
            max_cycles=12,
            ema_decay=0.9,
            learning_rate=0.002,
            weight_decay=0.0001,
            batch_size=8,
            epochs=1,
            device="cpu",
        ),
        telemetry=TelemetryConfig(enable_structured_logs=True, write_path=str(telemetry_path)),
        ethereum=EthereumConfig(rpc_url="https://mainnet.infura.io/v3/KEY", chain_id=1, logging_contract="0x0", confirmations_required=1),
    )


def test_simulation_emits_sentinel_events(tmp_path: Path) -> None:
    telemetry_path = tmp_path / "telemetry.jsonl"
    config = _make_demo_config(telemetry_path)
    engine = TinyRecursiveModelEngine.from_config(config.trm)
    ledger = EconomicLedger(
        value_per_success=config.ledger.value_per_success,
        base_compute_cost=config.ledger.base_compute_cost,
        cost_per_cycle=config.ledger.cost_per_cycle,
        daily_budget=config.ledger.daily_budget,
    )
    telemetry_writer = TelemetryWriter(telemetry_path, enabled=True)
    thermostat = Thermostat(config.thermostat, ledger, engine)
    sentinel = Sentinel(config.sentinel, ledger)
    simulation = ConversionSimulation(
        config,
        engine,
        ledger,
        thermostat,
        sentinel,
        telemetry_writer,
        samples=40,
        seed=7,
    )
    report = simulation.run()
    assert report.metrics["TRM"].attempts > 0
    with telemetry_path.open("r", encoding="utf-8") as handle:
        events = [json.loads(line) for line in handle if line.strip()]
    assert any(event.get("event_type") == "SentinelStatus" for event in events)
