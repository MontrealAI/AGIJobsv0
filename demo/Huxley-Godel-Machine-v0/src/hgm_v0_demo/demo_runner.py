"""Command line entry point for the Huxley–Gödel Machine demo."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple
import argparse
import json
import math
import random

from .baseline import GreedyBaselineSimulator
from .config_loader import ConfigError, DemoConfig, load_config
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


def _normalise_latency_range(value: Any, label: str) -> Tuple[float, float] | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        val = float(value)
        return (val, val)
    if isinstance(value, (list, tuple)):
        if not value:
            raise ConfigError(f"{label} must not be empty.")
        if len(value) == 1:
            val = float(value[0])
            return (val, val)
        try:
            first = float(value[0])
            second = float(value[1])
        except (TypeError, ValueError) as exc:
            raise ConfigError(f"{label} entries must be numeric.") from exc
        return (first, second)
    raise ConfigError(f"{label} must be a number or a two-element sequence.")


def run_hgm_demo(
    config: DemoConfig,
    rng: random.Random,
    output_dir: Path,
) -> tuple[RunSummary, Path]:
    engine = build_engine(config, rng)
    thermostat = build_thermostat(config, engine)
    sentinel = build_sentinel(config, engine)
    hgm_cfg = config.hgm
    econ = config.economics
    quality_cfg = hgm_cfg.get("quality", {})
    simulation_cfg = config.simulation
    evaluation_latency = _normalise_latency_range(
        simulation_cfg.get("evaluation_latency"),
        "simulation.evaluation_latency",
    )
    expansion_latency = _normalise_latency_range(
        simulation_cfg.get("expansion_latency"),
        "simulation.expansion_latency",
    )
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
        evaluation_latency_range=evaluation_latency,
        expansion_latency_range=expansion_latency,
    )
    total_steps = int(simulation_cfg.get("total_steps", 200))
    report_interval = int(simulation_cfg.get("report_interval", 10))
    summary = orchestrator.run(total_steps=total_steps, report_interval=report_interval)
    timeline_path = write_timeline(orchestrator.timeline.snapshots, output_dir)
    return summary, timeline_path


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


def write_timeline(snapshots: List[EconomicSnapshot], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    payload: List[Dict[str, Any]] = [asdict(snapshot) for snapshot in snapshots]
    path = output_dir / "timeline.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def format_summary_table(hgm: RunSummary, baseline: RunSummary) -> str:
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
    lines = [" | ".join(header.ljust(widths[idx]) for idx, header in enumerate(headers))]
    lines.append("-+-".join("-" * width for width in widths))
    for row in rows:
        lines.append(" | ".join(row[idx].ljust(widths[idx]) for idx in range(len(headers))))
    return "\n".join(lines)


def print_summary_table(hgm: RunSummary, baseline: RunSummary) -> str:
    table = format_summary_table(hgm, baseline)
    print("\n" + table)
    return table


def save_overall_report(hgm: RunSummary, baseline: RunSummary, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    delta_profit = hgm.profit - baseline.profit
    delta_roi = (0.0 if math.isinf(baseline.roi) else hgm.roi - baseline.roi)
    payload = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "hgm": asdict(hgm),
        "baseline": asdict(baseline),
        "profit_lift": delta_profit,
        "roi_delta": delta_roi,
    }
    path = output_dir / "summary.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def write_summary_text(table: str, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "summary.txt"
    path.write_text(table.rstrip() + "\n", encoding="utf-8")
    return path


def _parse_override_value(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def _parse_overrides(raw_overrides: Sequence[str]) -> List[Tuple[str, Any]]:
    overrides: List[Tuple[str, Any]] = []
    for raw in raw_overrides:
        if "=" not in raw:
            raise ConfigError("Overrides must be in KEY=VALUE format.")
        key, value = raw.split("=", 1)
        key = key.strip()
        if not key:
            raise ConfigError("Override keys must not be empty.")
        overrides.append((key, _parse_override_value(value.strip())))
    return overrides


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
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
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("demo/Huxley-Godel-Machine-v0/reports"),
        help="Directory where artifacts (timeline, summaries) will be written.",
    )
    parser.add_argument(
        "--set",
        dest="overrides",
        action="append",
        default=[],
        metavar="PATH=VALUE",
        help=(
            "Override configuration entries using dotted paths, e.g. "
            "--set simulation.total_steps=60 --set hgm.tau=0.8. Values are "
            "parsed as JSON when possible."
        ),
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    overrides = _parse_overrides(args.overrides)
    config = load_config(args.config, overrides=overrides)
    seed = args.seed if args.seed is not None else config.seed
    rng = random.Random(seed)
    hgm_summary, timeline_path = run_hgm_demo(config, rng, args.output_dir)
    baseline_rng = random.Random(seed + 1)
    baseline_summary = run_baseline(config, baseline_rng)
    table = print_summary_table(hgm_summary, baseline_summary)
    report_path = save_overall_report(hgm_summary, baseline_summary, args.output_dir)
    text_path = write_summary_text(table, args.output_dir)
    print(f"\nDetailed metrics saved to {report_path}")
    print(f"Tabular summary saved to {text_path}")
    if timeline_path.exists():
        print(f"Timeline saved to {timeline_path}")


if __name__ == "__main__":
    main()
