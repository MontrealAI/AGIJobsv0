"""Reporting utilities for the Tiny Recursive Model demo."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Dict

from rich.console import Console


from .orchestrator import SimulationResult


console = Console()

def export_report(artifact_dir: Path, results: Dict[str, SimulationResult], metrics: Dict[str, float]) -> None:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    json_path = artifact_dir / "report.json"
    md_path = artifact_dir / "report.md"
    csv_path = artifact_dir / "report.csv"

    json_path.write_text(
        json.dumps(
            {
                "results": {k: vars(v) for k, v in results.items()},
                "metrics": metrics,
            },
            indent=2,
        )
    )

    with csv_path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["approach", "success_rate", "cost", "value", "roi"])
        for result in results.values():
            writer.writerow(
                [
                    result.approach,
                    f"{result.success_rate:.4f}",
                    f"{result.cost:.6f}",
                    f"{result.value:.2f}",
                    f"{result.roi:.4f}",
                ]
            )

    markdown_lines = [
        "# Tiny Recursive Model Demo Report",
        "",
        "| Approach | Success Rate | Cost | Value | ROI |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    markdown_lines.extend(
        [
            f"| {res.approach} | {res.success_rate*100:.2f}% | ${res.cost:,.4f} | ${res.value:,.2f} | {res.roi:,.2f} |"
            for res in results.values()
        ]
    )
    markdown_lines.append("")
    markdown_lines.append("## Key Metrics")
    markdown_lines.extend(
        [f"- **{key.replace('_', ' ').title()}**: {value:.4f}" for key, value in metrics.items()]
    )
    md_path.write_text("\n".join(markdown_lines))
    console.log(f"Artifacts written to {artifact_dir}")
