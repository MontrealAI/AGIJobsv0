"""CLI entrypoint for the Open-Endedness demo."""
from __future__ import annotations

import argparse
import copy
import pathlib
import sys
from typing import Dict, Mapping

import yaml

CURRENT_DIR = pathlib.Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from simulator import (  # type: ignore
    FunnelSimulator,
    gmv_series,
    load_simulation_config,
    save_distribution_csv,
    save_json,
)


DEFAULT_CONFIG = CURRENT_DIR / "config.demo.yaml"
DEFAULT_OUTPUT_DIR = CURRENT_DIR / "reports" / "omni_output"


def _load_config(path: pathlib.Path) -> Mapping[str, object]:
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _prepare_output_dir(path: pathlib.Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _run_strategy(strategy: str, config_dict: Mapping[str, object]) -> Dict[str, object]:
    working_config = copy.deepcopy(config_dict)
    sim_config = load_simulation_config(working_config)
    interestingness_config = working_config.get("interestingness", {})
    if strategy == "lp":
        interestingness_config = {"model": "stub", "stub_profiles": []}
    simulator = FunnelSimulator(
        sim_config,
        interestingness_config=interestingness_config,
        strategy="uniform" if strategy == "uniform" else "omni",
    )
    simulator.run()
    gmv_curve = gmv_series(simulator.episode_results)
    summary = {
        "strategy": strategy,
        "gmv": simulator.gmv,
        "cost": simulator.cost,
        "roi": simulator.gmv / max(simulator.cost, 1e-9),
        "episodes": len(simulator.episode_results),
        "distribution_history": simulator.distribution_timeseries(),
        "telemetry": simulator.telemetry_bundle(),
        "gmv_curve": gmv_curve,
    }
    if strategy == "uniform":
        summary["telemetry"] = {"gmv": simulator.gmv, "cost": simulator.cost, "roi": summary["roi"]}
    return summary


def _write_report(output_dir: pathlib.Path, config: Mapping[str, object], results: Dict[str, Dict[str, object]]) -> None:
    template = pathlib.Path(__file__).with_name("report_template.md").read_text(encoding="utf-8")
    omni = results["omni"]
    lp_only = results["lp"]
    uniform = results["uniform"]
    gmvs_target = float(config["report"]["gmvs_target_usd"])
    content = template.format(
        episodes=omni["episodes"],
        omni_gmv=f"${omni['gmv']:,.2f}",
        omni_roi=f"{omni['roi']:.2f}x",
        lp_gmv=f"${lp_only['gmv']:,.2f}",
        lp_roi=f"{lp_only['roi']:.2f}x",
        uniform_gmv=f"${uniform['gmv']:,.2f}",
        uniform_roi=f"{uniform['roi']:.2f}x",
        gmv_lift=f"{(omni['gmv'] - lp_only['gmv']) / max(lp_only['gmv'], 1e-9) * 100:.1f}%",
        roi_lift=f"{(omni['roi'] - lp_only['roi']) / max(lp_only['roi'], 1e-9) * 100:.1f}%",
        gmv_target=f"${gmvs_target:,.0f}",
    )
    output_path = output_dir / "omni_report.md"
    output_path.write_text(content, encoding="utf-8")


def _write_artifacts(output_dir: pathlib.Path, config: Mapping[str, object], results: Dict[str, Dict[str, object]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    if config["report"].get("write_distribution_csv", False):
        for strategy, summary in results.items():
            history = summary["distribution_history"]
            if not history:
                continue
            save_distribution_csv(history, output_dir / f"{strategy}_distribution.csv")
    if config["report"].get("write_telemetry", False):
        for strategy, summary in results.items():
            save_json(summary["telemetry"], output_dir / f"{strategy}_telemetry.json")
    dashboards_dir = output_dir / "dashboards"
    dashboards_dir.mkdir(parents=True, exist_ok=True)
    dashboards_path = dashboards_dir / "omni_insights.json"
    save_json(results["omni"]["telemetry"], dashboards_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Open-Endedness demo")
    parser.add_argument(
        "--config",
        type=pathlib.Path,
        default=DEFAULT_CONFIG,
        help=f"Path to YAML config (default: {DEFAULT_CONFIG})",
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory to write artifacts (default: {DEFAULT_OUTPUT_DIR})",
    )
    args = parser.parse_args()

    config_dict = _load_config(args.config)
    _prepare_output_dir(args.output)

    results = {
        strategy: _run_strategy(strategy, config_dict)
        for strategy in ("uniform", "lp", "omni")
    }

    _write_artifacts(args.output, config_dict, results)
    _write_report(args.output, config_dict, results)

    print("=== OMNI Demo Complete ===")
    for strategy, summary in results.items():
        print(f"{strategy.upper():<8} GMV: ${summary['gmv']:,.2f} | ROI: {summary['roi']:.2f}x | Episodes: {summary['episodes']}")


if __name__ == "__main__":
    main()
