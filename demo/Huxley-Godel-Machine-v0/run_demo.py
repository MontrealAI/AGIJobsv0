"""Entry point for the Huxley–Gödel Machine grand demo."""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import random

from hgm_demo.baseline import GreedyBaseline
from hgm_demo.config import Config, load_config_with_overrides
from hgm_demo.engine import HGMEngine
from hgm_demo.orchestrator import DemoOrchestrator, EconomicParameters
from hgm_demo.sentinel import Sentinel, SentinelConfig
from hgm_demo.simulation import EconomicModel, SimulationEnvironment
from hgm_demo.structures import DemoTelemetry
from hgm_demo.thermostat import Thermostat, ThermostatConfig


def _build_environment(rng: random.Random, config: Config) -> SimulationEnvironment:
    sim_cfg = config.simulation
    econ_cfg = config.economic_model
    economic_model = EconomicModel(
        success_value=float(econ_cfg["success_value"]),
        failure_cost=float(econ_cfg["failure_cost"]),
        expansion_cost=float(econ_cfg["expansion_cost"]),
    )
    return SimulationEnvironment(
        rng=rng,
        economic_model=economic_model,
        quality_sigma=float(sim_cfg["quality_sigma"]),
        quality_bounds=(float(sim_cfg["quality_floor"]), float(sim_cfg["quality_ceiling"])),
        baseline_quality_drift=float(sim_cfg["baseline_quality_drift"]),
        innovation_bias=float(sim_cfg.get("innovation_bias", 0.0)),
        evaluation_latency=tuple(float(x) for x in sim_cfg["evaluation_latency"]),
        expansion_latency=tuple(float(x) for x in sim_cfg["expansion_latency"]),
    )


def _build_engine(rng: random.Random, config: Config) -> HGMEngine:
    eng_cfg = config.engine
    return HGMEngine(
        tau=float(eng_cfg["tau"]),
        alpha=float(eng_cfg["alpha"]),
        epsilon=float(eng_cfg["epsilon"]),
        rng=rng,
    )


async def _run_hgm(config: Config, telemetry: DemoTelemetry) -> None:
    master_seed = int(config.simulation["seed"])
    rng_master = random.Random(master_seed)
    engine_rng = random.Random(rng_master.random())
    env_rng = random.Random(rng_master.random())
    engine = _build_engine(engine_rng, config)
    agent_cfg = config.initial_agent
    engine.register_root(
        quality=float(agent_cfg["quality"]),
        description=str(agent_cfg["name"]),
    )
    econ_cfg = config.economic_model
    sim_cfg = config.simulation
    eval_latency = tuple(float(x) for x in sim_cfg["evaluation_latency"])
    exp_latency = tuple(float(x) for x in sim_cfg["expansion_latency"])
    avg_eval_latency = sum(eval_latency) / len(eval_latency)
    avg_exp_latency = sum(exp_latency) / len(exp_latency)
    orchestrator = DemoOrchestrator(
        engine,
        thermostat=Thermostat(ThermostatConfig(**config.thermostat)),
        sentinel=Sentinel(SentinelConfig(**config.sentinel)),
        parameters=EconomicParameters(
            evaluation_cost=float(econ_cfg["failure_cost"]),
            expansion_cost=float(econ_cfg["expansion_cost"]),
            base_success_value=float(econ_cfg["success_value"]),
            evaluation_latency=avg_eval_latency,
            expansion_latency=avg_exp_latency,
        ),
        rng=env_rng,
    )
    await orchestrator.run(max_actions=int(config.engine["max_actions"]))
    metrics = orchestrator.metrics
    telemetry.ledger.gmv = metrics.total_gmv
    telemetry.ledger.cost = metrics.total_cost
    telemetry.final_agent_id = engine.best_agent().agent_id
    telemetry.hgm_profit = telemetry.ledger.profit


async def _run_baseline(config: Config, telemetry: DemoTelemetry, *, steps: int) -> None:
    baseline_seed = int(config.simulation["seed"]) + 101
    env_rng = random.Random(baseline_seed)
    environment = _build_environment(env_rng, config)
    agent_cfg = config.initial_agent
    root = environment.create_root(
        name=agent_cfg["name"],
        quality=float(agent_cfg["quality"]),
        prior_successes=int(agent_cfg["prior_successes"]),
        prior_failures=int(agent_cfg["prior_failures"]),
    )
    baseline = GreedyBaseline(
        environment=environment,
        expansion_interval=int(config.baseline["expansion_interval"]),
        max_agents=int(config.baseline["max_agents"]),
    )
    ledger = await baseline.run(steps // 2, root)
    telemetry.baseline_profit = ledger.profit


def format_currency(value: float) -> str:
    return f"$ {value:,.2f}"


def render_report(telemetry: DemoTelemetry) -> str:
    lines = [
        "\n================== Huxley–Gödel Machine Demo ==================",
        f"Total GMV      : {format_currency(telemetry.ledger.gmv)}",
        f"Total Cost     : {format_currency(telemetry.ledger.cost)}",
        f"Net Profit     : {format_currency(telemetry.ledger.profit)}",
        f"ROI            : {telemetry.ledger.roi:,.2f}x",
    ]
    if telemetry.hgm_profit is not None and telemetry.baseline_profit is not None:
        lift = telemetry.hgm_profit - telemetry.baseline_profit
        pct = (lift / abs(telemetry.baseline_profit)) * 100 if telemetry.baseline_profit else float("inf")
        lines.extend(
            [
                "--------------------------------------------------------------",
                f"Baseline Profit : {format_currency(telemetry.baseline_profit)}",
                f"HGM Profit      : {format_currency(telemetry.hgm_profit)}",
                f"Profit Lift     : {format_currency(lift)} ({pct:,.1f}% vs baseline)",
            ]
        )
    lines.append("==============================================================\n")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Huxley–Gödel Machine showcase.")
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Optional path to a configuration JSON file",
    )
    parser.add_argument(
        "--set",
        dest="overrides",
        action="append",
        default=[],
        metavar="PATH=VALUE",
        help=(
            "Override configuration values without editing JSON. "
            "For example: --set engine.tau=2.4 --set sentinel.min_roi=1.2"
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("demo/Huxley-Godel-Machine-v0/artifacts"),
        help="Directory where run artifacts will be stored",
    )
    args = parser.parse_args()
    try:
        config = load_config_with_overrides(args.config, args.overrides)
    except ValueError as exc:
        parser.error(str(exc))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    telemetry = DemoTelemetry()
    asyncio.run(_run_hgm(config, telemetry))
    asyncio.run(_run_baseline(config, telemetry, steps=config.engine["max_actions"]))
    report = render_report(telemetry)
    print(report)
    summary_path = args.output_dir / "summary.txt"
    summary_path.write_text(report)
    artifact_path = args.output_dir / "hgm_run.json"
    artifact_path.write_text(json.dumps(telemetry.to_dict(), indent=2))


if __name__ == "__main__":
    main()
