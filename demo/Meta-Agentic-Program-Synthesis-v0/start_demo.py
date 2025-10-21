"""Command-line entrypoint for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from textwrap import indent

from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.orchestrator import SovereignArchitect
from meta_agentic_demo.report import export_report


SCENARIOS = [
    DemoScenario(
        identifier="alpha",
        title="Alpha Efficiency Sweep",
        description=(
            "Ask the sovereign architect to refine an internal automation workflow, "
            "discovering an increasingly efficient control signal."
        ),
        target_metric="Workflow productivity uplift",
        success_threshold=0.82,
    ),
    DemoScenario(
        identifier="atlas",
        title="Atlas Market Sentinel",
        description=(
            "Hunt for cross-market inefficiencies by evolving a forecasting kernel that "
            "beats the benchmark risk-adjusted score."
        ),
        target_metric="Information ratio",
        success_threshold=0.78,
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "scenario",
        choices=[scenario.identifier for scenario in SCENARIOS],
        help="Identifier of the narrative to execute",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("demo_output"),
        help="Directory where artefacts should be written",
    )
    return parser.parse_args()


def describe_config(config: DemoConfig) -> str:
    summary = config.as_summary()
    return json.dumps(summary, indent=2)


def main() -> None:
    args = parse_args()
    scenario = next(s for s in SCENARIOS if s.identifier == args.scenario)
    config = DemoConfig(scenarios=SCENARIOS)
    architect = SovereignArchitect(config=config)
    print("🚀 Initiating sovereign architect for scenario:", scenario.title)
    print(indent(scenario.description, prefix="  > "))
    print("\n🧭 Configuration:")
    print(indent(describe_config(config), prefix="  "))
    artefacts = architect.run(scenario)
    bundle = export_report(artefacts, args.output)
    print("\n✅ Demo complete. Artefacts written to:")
    print(f"  • JSON: {bundle.json_path}")
    print(f"  • HTML: {bundle.html_path}")
    print("\n🏁 Final program:")
    print(indent(artefacts.final_program, prefix="  "))
    print(f"Composite score: {artefacts.final_score:.4f}")


if __name__ == "__main__":
    main()
