"""Command line entry point for the Huxley–Gödel Machine demo."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
import argparse
import json
import math
import random

from .baseline import GreedyBaselineSimulator
from .config_loader import DemoConfig, load_config
from .engine import HGMEngine
from .metrics import EconomicSnapshot, RunSummary
from .orchestrator import HGMDemoOrchestrator
from .sentinel import Sentinel
from .thermostat import Thermostat, ThermostatConfig


def build_engine(config: DemoConfig, rng: random.Random) -> HGMEngine:
    hgm_cfg = config.hgm
    engine = HGMEngine(
        tau=float(hgm_cfg["tau"]),
        alpha=float(hgm_cfg["alpha"]),
        epsilon=float(hgm_cfg.get("epsilon", 0.1)),
        max_agents=int(hgm_cfg.get("max_agents", 64)),
        max_expansions=int(hgm_cfg.get("max_expansions", 256)),
        max_evaluations=int(hgm_cfg.get("max_evaluations", 1024)),
        rng=rng,
    )
    concurrency = hgm_cfg.get("concurrency", {})
    engine.set_max_evaluation_concurrency(int(concurrency.get("evaluation", 1)))
    engine.set_max_expansion_concurrency(int(concurrency.get("expansion", 1)))
    quality_cfg = hgm_cfg.get("quality", {})
    root_quality = float(quality_cfg.get("root", 0.5))
    engine.register_root(root_quality)
    return engine


def build_thermostat(config: DemoConfig, engine: HGMEngine) -> Thermostat:
    thermo_cfg = config.thermostat
    economics = config.economics
    thermostat = Thermostat(
        engine=engine,
        config=ThermostatConfig(
            target_roi=float(economics.get("target_roi", 2.0)),
            roi_window=int(thermo_cfg.get("roi_window", 10)),
            tau_adjustment=float(thermo_cfg.get("tau_adjustment", 0.1)),
            alpha_adjustment=float(thermo_cfg.get("alpha_adjustment", 0.1)),
            concurrency_step=int(thermo_cfg.get("concurrency_step", 1)),
            max_concurrency=int(thermo_cfg.get("max_concurrency", 8)),
            min_concurrency=int(thermo_cfg.get("min_concurrency", 1)),
            roi_upper_margin=float(thermo_cfg.get("roi_upper_margin", 0.2)),
            roi_lower_margin=float(thermo_cfg.get("roi_lower_margin", 0.1)),
        ),
    )
    return thermostat


def build_sentinel(config: DemoConfig, engine: HGMEngine) -> Sentinel:
    economics = config.economics
    sentinel_cfg = config.sentinel
    return Sentinel(
        engine=engine,
        max_budget=float(economics.get("max_budget", 1000.0)),
        min_roi=float(economics.get("min_roi", 1.0)),
        hard_budget_ratio=float(sentinel_cfg.get("hard_budget_ratio", 0.9)),
        max_failures_per_agent=int(sentinel_cfg.get("max_failures_per_agent", 20)),
        roi_recovery_steps=int(sentinel_cfg.get("roi_recovery_steps", 6)),
    )


def run_hgm_demo(config: DemoConfig, rng: random.Random) -> RunSummary:
    engine = build_engine(config, rng)
    thermostat = build_thermostat(config, engine)
    sentinel = build_sentinel(config, engine)
    hgm_cfg = config.hgm
    econ = config.economics
    quality_cfg = hgm_cfg.get("quality", {})
    orchestrator = HGMDemoOrchestrator(
        engine=engine,
        thermostat=thermostat,
        sentinel=sentinel,
        rng=rng,
        success_value=float(econ.get("success_value", 100.0)),
        evaluation_cost=float(econ.get("evaluation_cost", 10.0)),
        expansion_cost=float(econ.get("expansion_cost", 25.0)),
        mutation_std=float(hgm_cfg.get("quality", {}).get("mutation_std", 0.1)),
        quality_bounds=(
            float(quality_cfg.get("min_quality", 0.01)),
            float(quality_cfg.get("max_quality", 0.99)),
        ),
    )
    simulation_cfg = config.simulation
    total_steps = int(simulation_cfg.get("total_steps", 200))
    report_interval = int(simulation_cfg.get("report_interval", 10))
    summary = orchestrator.run(total_steps=total_steps, report_interval=report_interval)
    write_timeline(orchestrator.timeline.snapshots)
    return summary


def run_baseline(config: DemoConfig, rng: random.Random) -> RunSummary:
    econ = config.economics
    hgm_cfg = config.hgm
    quality_cfg = hgm_cfg.get("quality", {})
    baseline_cfg = config.baseline
    simulator = GreedyBaselineSimulator(
        rng=rng,
        root_quality=float(quality_cfg.get("root", 0.5)),
        mutation_std=float(baseline_cfg.get("mutation_std", 0.1)),
        success_value=float(econ.get("success_value", 100.0)),
        evaluation_cost=float(econ.get("evaluation_cost", 10.0)),
        expansion_cost=float(econ.get("expansion_cost", 25.0)),
        total_steps=int(config.simulation.get("baseline_total_steps", 200)),
        quality_bounds=(
            float(baseline_cfg.get("quality_floor", 0.01)),
            float(baseline_cfg.get("quality_ceiling", 0.99)),
        ),
    )
    return simulator.run()


def write_timeline(snapshots: List[EconomicSnapshot]) -> None:
    report_dir = Path("demo/Huxley-Godel-Machine-v0/reports")
    report_dir.mkdir(parents=True, exist_ok=True)
    payload: List[Dict[str, Any]] = [asdict(snapshot) for snapshot in snapshots]
    path = report_dir / "hgm_timeline.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def print_summary_table(hgm: RunSummary, baseline: RunSummary) -> None:
    headers = [
        "Strategy",
        "GMV",
        "Cost",
        "Profit",
        "ROI",
        "Successes",
        "Failures",
    ]
    rows = [
        [
            hgm.strategy,
            f"${hgm.gmv:,.2f}",
            f"${hgm.cost:,.2f}",
            f"${hgm.profit:,.2f}",
            "∞" if math.isinf(hgm.roi) else f"{hgm.roi:.2f}",
            str(hgm.successes),
            str(hgm.failures),
        ],
        [
            baseline.strategy,
            f"${baseline.gmv:,.2f}",
            f"${baseline.cost:,.2f}",
            f"${baseline.profit:,.2f}",
            "∞" if math.isinf(baseline.roi) else f"{baseline.roi:.2f}",
            str(baseline.successes),
            str(baseline.failures),
        ],
    ]
    widths = [max(len(str(row[idx])) for row in ([headers] + rows)) for idx in range(len(headers))]
    line = " | ".join(header.ljust(widths[idx]) for idx, header in enumerate(headers))
    print("\n" + line)
    print("-+-".join("-" * width for width in widths))
    for row in rows:
        print(" | ".join(row[idx].ljust(widths[idx]) for idx in range(len(headers))))


def save_overall_report(hgm: RunSummary, baseline: RunSummary) -> Path:
    report_dir = Path("demo/Huxley-Godel-Machine-v0/reports")
    report_dir.mkdir(parents=True, exist_ok=True)
    delta_profit = hgm.profit - baseline.profit
    delta_roi = (0.0 if math.isinf(baseline.roi) else hgm.roi - baseline.roi)
    payload = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "hgm": asdict(hgm),
        "baseline": asdict(baseline),
        "profit_lift": delta_profit,
        "roi_delta": delta_roi,
    }
    path = report_dir / "summary.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Huxley–Gödel Machine demo simulation")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("demo/Huxley-Godel-Machine-v0/config/hgm_demo_config.json"),
        help="Path to the demo configuration file.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional random seed override for reproducibility.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    seed = args.seed if args.seed is not None else config.seed
    rng = random.Random(seed)
    hgm_summary = run_hgm_demo(config, rng)
    baseline_rng = random.Random(seed + 1)
    baseline_summary = run_baseline(config, baseline_rng)
    print_summary_table(hgm_summary, baseline_summary)
    report_path = save_overall_report(hgm_summary, baseline_summary)
    print(f"\nDetailed metrics saved to {report_path}")


if __name__ == "__main__":
    main()
