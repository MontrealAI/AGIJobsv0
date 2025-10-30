"""High-level simulation runner for the Huxley–Gödel Machine demo.

This module coordinates both the HGM strategy and the greedy baseline using the
same configuration file.  It is responsible for producing artefacts that can be
consumed by the command-line tooling as well as the interactive web viewer.
"""
from __future__ import annotations

import json
import math
import random
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from hgm_v0_demo.baseline import GreedyBaselineSimulator
from hgm_v0_demo.config_loader import ConfigError, DemoConfig, load_config
from hgm_v0_demo.engine import HGMEngine
from hgm_v0_demo.lineage import MermaidOptions, mermaid_from_snapshots
from hgm_v0_demo.metrics import EconomicSnapshot, RunSummary
from hgm_v0_demo.orchestrator import HGMDemoOrchestrator
from hgm_v0_demo.owner_controls import OwnerControls
from hgm_v0_demo.sentinel import Sentinel
from hgm_v0_demo.thermostat import Thermostat, ThermostatConfig


@dataclass
class StrategyResult:
    """Output for a single strategy (HGM or baseline)."""

    summary: RunSummary
    timeline: List[EconomicSnapshot]
    logs: List[str]
    timeline_path: Path
    mermaid_path: Path | None = None


@dataclass
class SimulationReport:
    """Container returned by :func:`run_simulation`."""

    config_path: Path
    seed: int
    hgm: StrategyResult
    baseline: StrategyResult
    summary_table: str
    summary_json_path: Path
    summary_txt_path: Path
    roi_chart_path: Path
    comparison_artifact_path: Path
    log_path: Path


def _build_engine(config: DemoConfig, rng: random.Random) -> HGMEngine:
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


def _build_thermostat(config: DemoConfig, engine: HGMEngine) -> Thermostat:
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


def _build_sentinel(config: DemoConfig, engine: HGMEngine) -> Sentinel:
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


def _write_json(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def _safe_number(value: Any) -> Any:
    if isinstance(value, float) and (math.isinf(value) or math.isnan(value)):
        return None
    return value


def _snapshot_to_dict(snapshot: EconomicSnapshot) -> Dict[str, Any]:
    payload = asdict(snapshot)
    payload["roi"] = _safe_number(snapshot.roi)
    payload["gmv"] = _safe_number(snapshot.gmv)
    payload["cost"] = _safe_number(snapshot.cost)
    return payload


def _timeline_to_dict(timeline: Iterable[EconomicSnapshot]) -> List[Dict[str, Any]]:
    return [_snapshot_to_dict(snapshot) for snapshot in timeline]


def _format_hgm_log(snapshot: EconomicSnapshot) -> str:
    roi = "∞" if math.isinf(snapshot.roi) else f"{snapshot.roi:.2f}"
    return (
        f"[HGM] step={snapshot.step:03d} agents={len(snapshot.agents):02d} "
        f"gmv={snapshot.gmv:.2f} cost={snapshot.cost:.2f} roi={roi}"
    )


def _format_baseline_log(snapshot: EconomicSnapshot) -> str:
    roi = "∞" if math.isinf(snapshot.roi) else f"{snapshot.roi:.2f}"
    return (
        f"[Baseline] step={snapshot.step:03d} gmv={snapshot.gmv:.2f} "
        f"cost={snapshot.cost:.2f} roi={roi}"
    )


def _write_logs(path: Path, hgm_logs: Sequence[str], baseline_logs: Sequence[str]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines: List[str] = ["# HGM Strategy Log", ""]
    lines.extend(hgm_logs)
    lines.extend(["", "# Baseline Strategy Log", ""])
    lines.extend(baseline_logs)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _write_roi_chart(path: Path, hgm_timeline: Sequence[EconomicSnapshot], baseline_timeline: Sequence[EconomicSnapshot]) -> Path:
    """Generate a lightweight SVG ROI chart without external dependencies."""

    def _series(points: Sequence[EconomicSnapshot]) -> List[Tuple[int, float]]:
        series: List[Tuple[int, float]] = []
        for snapshot in points:
            if math.isinf(snapshot.roi):
                continue
            series.append((snapshot.step, snapshot.roi))
        return series

    hgm_series = _series(hgm_timeline)
    baseline_series = _series(baseline_timeline)
    if not hgm_series and not baseline_series:
        payload = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"320\"></svg>"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload, encoding="utf-8")
        return path

    all_steps = [step for step, _ in hgm_series + baseline_series]
    all_values = [value for _, value in hgm_series + baseline_series]
    if not all_steps:
        all_steps = [0, 1]
    if not all_values:
        all_values = [0.0, 1.0]
    min_step, max_step = min(all_steps), max(all_steps)
    min_value, max_value = min(all_values), max(all_values)
    if math.isclose(min_value, max_value):
        max_value = min_value + 1.0

    width, height = 760, 360
    margin = 50

    def _scale_point(step: int, value: float) -> Tuple[float, float]:
        x = margin + ((step - min_step) / (max_step - min_step or 1)) * (width - 2 * margin)
        y = height - margin - ((value - min_value) / (max_value - min_value or 1)) * (height - 2 * margin)
        return x, y

    def _polyline(series: Sequence[Tuple[int, float]], colour: str) -> str:
        if not series:
            return ""
        points = ["{:.1f},{:.1f}".format(*_scale_point(step, value)) for step, value in series]
        return f"<polyline fill=\"none\" stroke=\"{colour}\" stroke-width=\"3\" points=\"{' '.join(points)}\" />"

    axes = [
        f"<line x1=\"{margin}\" y1=\"{height - margin}\" x2=\"{width - margin}\" y2=\"{height - margin}\" stroke=\"#666\" stroke-width=\"1\" />",
        f"<line x1=\"{margin}\" y1=\"{margin}\" x2=\"{margin}\" y2=\"{height - margin}\" stroke=\"#666\" stroke-width=\"1\" />",
    ]

    labels = [
        f"<text x=\"{width/2:.0f}\" y=\"{height - 10}\" text-anchor=\"middle\" font-size=\"14\">Steps</text>",
        f"<text x=\"20\" y=\"{height/2:.0f}\" transform=\"rotate(-90 20,{height/2:.0f})\" font-size=\"14\">ROI (x)</text>",
    ]

    legend_y = margin - 20
    legend = [
        f"<rect x=\"{margin}\" y=\"{legend_y}\" width=\"18\" height=\"6\" fill=\"#3b82f6\" />",
        f"<text x=\"{margin + 24}\" y=\"{legend_y + 6}\" font-size=\"12\">HGM</text>",
        f"<rect x=\"{margin + 80}\" y=\"{legend_y}\" width=\"18\" height=\"6\" fill=\"#ef4444\" />",
        f"<text x=\"{margin + 104}\" y=\"{legend_y + 6}\" font-size=\"12\">Baseline</text>",
    ]

    hgm_poly = _polyline(hgm_series, "#3b82f6")
    baseline_poly = _polyline(baseline_series, "#ef4444")
    svg = (
        f"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\">"
        + "".join(axes)
        + "".join(labels)
        + "".join(legend)
        + hgm_poly
        + baseline_poly
        + "</svg>"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg, encoding="utf-8")
    return path


def _format_summary_table(hgm: RunSummary, baseline: RunSummary) -> str:
    headers = ["Strategy", "GMV", "Cost", "Profit", "ROI", "Successes", "Failures"]
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


def _write_summary_text(path: Path, table: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(table.rstrip() + "\n", encoding="utf-8")
    return path


def _build_hgm_orchestrator(config: DemoConfig, engine: HGMEngine, rng: random.Random) -> HGMDemoOrchestrator:
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
    thermostat = _build_thermostat(config, engine)
    sentinel = _build_sentinel(config, engine)
    try:
        owner_controls = OwnerControls.from_mapping(config.owner_controls)
    except ValueError as exc:
        raise ConfigError(str(exc)) from exc
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
        owner_controls=owner_controls,
    )
    return orchestrator


def _run_hgm(config: DemoConfig, seed: int, output_dir: Path) -> StrategyResult:
    rng = random.Random(seed)
    engine = _build_engine(config, rng)
    orchestrator = _build_hgm_orchestrator(config, engine, rng)
    simulation_cfg = config.simulation
    total_steps = int(simulation_cfg.get("total_steps", 200))
    report_interval = int(simulation_cfg.get("report_interval", 10))
    summary = orchestrator.run(total_steps=total_steps, report_interval=report_interval)

    timeline = orchestrator.timeline.snapshots
    hgm_logs = [_format_hgm_log(snapshot) for snapshot in timeline]

    timeline_path = output_dir / "hgm_timeline.json"
    _write_json(timeline_path, _timeline_to_dict(timeline))

    mermaid_path: Path | None = None
    if timeline:
        final_snapshot = orchestrator.timeline.last
        mermaid_text = mermaid_from_snapshots(
            final_snapshot.agents,
            options=MermaidOptions(highlight_agent=summary.best_agent_id),
        )
        mermaid_path = output_dir / "hgm_lineage.mmd"
        mermaid_path.write_text(mermaid_text, encoding="utf-8")

    return StrategyResult(
        summary=summary,
        timeline=list(timeline),
        logs=hgm_logs,
        timeline_path=timeline_path,
        mermaid_path=mermaid_path,
    )


def _run_baseline(config: DemoConfig, seed: int, output_dir: Path) -> StrategyResult:
    econ = config.economics
    hgm_cfg = config.hgm
    quality_cfg = hgm_cfg.get("quality", {})
    baseline_cfg = config.baseline
    simulator = GreedyBaselineSimulator(
        rng=random.Random(seed),
        root_quality=float(quality_cfg.get("root", 0.5)),
        mutation_std=float(baseline_cfg.get("mutation_std", 0.1)),
        success_value=float(econ.get("success_value", 100.0)),
        evaluation_cost=float(econ.get("evaluation_cost", 10.0)),
        expansion_cost=float(econ.get("expansion_cost", 25.0)),
        total_steps=int(config.simulation.get("baseline_total_steps", config.simulation.get("total_steps", 200))),
        quality_bounds=(
            float(baseline_cfg.get("quality_floor", 0.01)),
            float(baseline_cfg.get("quality_ceiling", 0.99)),
        ),
    )
    summary = simulator.run()
    baseline_timeline = simulator.timeline
    timeline_path = output_dir / "baseline_timeline.json"
    _write_json(timeline_path, _timeline_to_dict(baseline_timeline))

    return StrategyResult(
        summary=summary,
        timeline=baseline_timeline,
        logs=list(simulator.logs),
        timeline_path=timeline_path,
        mermaid_path=None,
    )


def _write_summary_json(path: Path, hgm: RunSummary, baseline: RunSummary) -> Path:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "hgm": {
            key: _safe_number(value) if isinstance(value, float) else value
            for key, value in asdict(hgm).items()
        },
        "baseline": {
            key: _safe_number(value) if isinstance(value, float) else value
            for key, value in asdict(baseline).items()
        },
        "profit_lift": _safe_number(hgm.profit - baseline.profit),
        "roi_delta": _safe_number(
            0.0 if math.isinf(baseline.roi) else hgm.roi - baseline.roi
        ),
    }
    return _write_json(path, payload)


def _build_ui_artifact(path: Path, config_path: Path, seed: int, hgm: StrategyResult, baseline: StrategyResult, roi_chart_path: Path, summary_table: str) -> Path:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
        "config_path": str(config_path),
        "summary_table": summary_table,
        "hgm": {
            "summary": {
                key: _safe_number(value) if isinstance(value, float) else value
                for key, value in asdict(hgm.summary).items()
            },
            "timeline": _timeline_to_dict(hgm.timeline),
            "logs": hgm.logs,
        },
        "baseline": {
            "summary": {
                key: _safe_number(value) if isinstance(value, float) else value
                for key, value in asdict(baseline.summary).items()
            },
            "timeline": _timeline_to_dict(baseline.timeline),
            "logs": baseline.logs,
        },
        "roi_chart": {
            "path": str(roi_chart_path),
            "hgm": [
                {
                    "step": snap.step,
                    "roi": _safe_number(snap.roi),
                    "gmv": _safe_number(snap.gmv),
                    "cost": _safe_number(snap.cost),
                }
                for snap in hgm.timeline
            ],
            "baseline": [
                {
                    "step": snap.step,
                    "roi": _safe_number(snap.roi),
                    "gmv": _safe_number(snap.gmv),
                    "cost": _safe_number(snap.cost),
                }
                for snap in baseline.timeline
            ],
        },
    }
    return _write_json(path, payload)


def run_simulation(
    *,
    config_path: Path,
    overrides: Sequence[Tuple[str, Any]] | None = None,
    seed: int | None = None,
    output_dir: Path,
    ui_artifact_path: Path | None = None,
) -> SimulationReport:
    """Execute the HGM and baseline strategies using the provided config."""

    config = load_config(config_path, overrides=overrides or [])
    actual_seed = seed if seed is not None else config.seed

    output_dir.mkdir(parents=True, exist_ok=True)

    hgm_result = _run_hgm(config, actual_seed, output_dir)
    baseline_result = _run_baseline(config, actual_seed + 1, output_dir)

    summary_table = _format_summary_table(hgm_result.summary, baseline_result.summary)
    summary_txt_path = _write_summary_text(output_dir / "summary.txt", summary_table)
    summary_json_path = _write_summary_json(output_dir / "summary.json", hgm_result.summary, baseline_result.summary)
    roi_chart_path = _write_roi_chart(output_dir / "roi_comparison.svg", hgm_result.timeline, baseline_result.timeline)
    log_path = _write_logs(output_dir / "logs.md", hgm_result.logs, baseline_result.logs)

    if ui_artifact_path is None:
        ui_artifact_path = output_dir / "comparison.json"
    comparison_artifact_path = _build_ui_artifact(
        ui_artifact_path,
        config_path=config_path,
        seed=actual_seed,
        hgm=hgm_result,
        baseline=baseline_result,
        roi_chart_path=roi_chart_path,
        summary_table=summary_table,
    )

    return SimulationReport(
        config_path=config_path,
        seed=actual_seed,
        hgm=hgm_result,
        baseline=baseline_result,
        summary_table=summary_table,
        summary_json_path=summary_json_path,
        summary_txt_path=summary_txt_path,
        roi_chart_path=roi_chart_path,
        comparison_artifact_path=comparison_artifact_path,
        log_path=log_path,
    )


def parse_overrides(raw_overrides: Sequence[str]) -> List[Tuple[str, Any]]:
    overrides: List[Tuple[str, Any]] = []
    for raw in raw_overrides:
        if "=" not in raw:
            raise ConfigError("Overrides must be in KEY=VALUE format.")
        key, value = raw.split("=", 1)
        key = key.strip()
        if not key:
            raise ConfigError("Override keys must not be empty.")
        try:
            parsed_value = json.loads(value)
        except json.JSONDecodeError:
            parsed_value = value
        overrides.append((key, parsed_value))
    return overrides


def run_cli(
    *,
    config: Path,
    output_dir: Path,
    seed: int | None,
    overrides: Sequence[str],
    ui_artifact: Path | None,
) -> SimulationReport:
    parsed_overrides = parse_overrides(overrides)
    report = run_simulation(
        config_path=config,
        overrides=parsed_overrides,
        seed=seed,
        output_dir=output_dir,
        ui_artifact_path=ui_artifact,
    )

    print("\n" + report.summary_table)
    print(f"\nSummary JSON saved to {report.summary_json_path}")
    print(f"Timeline saved to {report.hgm.timeline_path}")
    print(f"Baseline timeline saved to {report.baseline.timeline_path}")
    if report.hgm.mermaid_path is not None:
        print(f"Mermaid lineage saved to {report.hgm.mermaid_path}")
    print(f"ROI chart saved to {report.roi_chart_path}")
    print(f"Logs saved to {report.log_path}")
    print(f"UI artefact saved to {report.comparison_artifact_path}")

    if report.hgm.summary.best_agent_id:
        quality = (
            "?"
            if report.hgm.summary.best_agent_quality is None
            else f"{report.hgm.summary.best_agent_quality:.3f}"
        )
        print(
            f"Best-belief agent: {report.hgm.summary.best_agent_id} with estimated quality {quality}"
        )
    if report.hgm.summary.owner_notes:
        print(f"Owner directives: {report.hgm.summary.owner_notes}")
    return report


__all__ = [
    "StrategyResult",
    "SimulationReport",
    "run_simulation",
    "run_cli",
    "parse_overrides",
]
