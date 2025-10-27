"""Entry point for the Superintelligent Empowerment demo.

This script loads the scenario configuration, synthesises a narrative
of empowered stakeholders, and emits an impact report. It is designed
so the setup script can execute it end-to-end without manual
intervention.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import yaml
from rich.console import Console
from rich.table import Table


console = Console()


@dataclass
class Initiative:
    """Represents a single empowerment initiative."""

    name: str
    description: str
    beneficiaries: List[str]
    capability_vector: List[str]
    success_metric: str


@dataclass
class DemoReport:
    """Structured output for the impact story."""

    generated_at: str
    executive_summary: str
    initiatives: List[Initiative]
    projected_outcomes: List[str]

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["initiatives"] = [asdict(item) for item in self.initiatives]
        return payload


class DemoOrchestrator:
    """Creates a narrative based on configuration inputs."""

    def __init__(self, config: dict):
        self.config = config

    def build_initiatives(self) -> List[Initiative]:
        initiatives = []
        for entry in self.config.get("initiatives", []):
            initiatives.append(
                Initiative(
                    name=entry["name"],
                    description=entry["description"],
                    beneficiaries=entry["beneficiaries"],
                    capability_vector=entry["capability_vector"],
                    success_metric=entry["success_metric"],
                )
            )
        return initiatives

    def craft_summary(self, initiatives: List[Initiative]) -> str:
        headline = self.config["story"].get("headline")
        tone = self.config["story"].get("tone")
        empowerment_hook = self.config["story"].get("empowerment_hook")
        return (
            f"{headline}\n"
            f"Tone: {tone}.\n"
            f"Empowerment: {empowerment_hook}."
        )

    def compute_projected_outcomes(self) -> List[str]:
        growth_targets = self.config.get("growth_targets", [])
        resilience_targets = self.config.get("resilience_targets", [])
        return [
            f"Projected growth: {target}" for target in growth_targets
        ] + [
            f"Resilience gain: {target}" for target in resilience_targets
        ]

    def render_console_summary(self, initiatives: List[Initiative]) -> None:
        table = Table(title="Empowerment Initiative Portfolio")
        table.add_column("Initiative")
        table.add_column("Beneficiaries")
        table.add_column("Superintelligent Capabilities")
        table.add_column("Success Metric")

        for initiative in initiatives:
            table.add_row(
                initiative.name,
                "\n".join(initiative.beneficiaries),
                "\n".join(initiative.capability_vector),
                initiative.success_metric,
            )
        console.print(table)

    def build_report(self) -> DemoReport:
        initiatives = self.build_initiatives()
        self.render_console_summary(initiatives)
        summary = self.craft_summary(initiatives)
        outcomes = self.compute_projected_outcomes()
        return DemoReport(
            generated_at=datetime.now(timezone.utc).isoformat(),
            executive_summary=summary,
            initiatives=initiatives,
            projected_outcomes=outcomes,
        )


def load_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the empowerment demo")
    parser.add_argument(
        "--config",
        type=Path,
        required=True,
        help="Path to the YAML configuration file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Path for the generated JSON report",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    orchestrator = DemoOrchestrator(config)
    report = orchestrator.build_report()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(report.to_dict(), handle, indent=2)

    console.log(f"Impact report saved to {args.output}")


if __name__ == "__main__":
    main()
