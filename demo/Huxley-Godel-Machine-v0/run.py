"""Command line entrypoint for the Huxley–Gödel Machine demo."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from textwrap import dedent

from hgm_demo.simulation import run_comparison


def build_report_markdown(output_path: Path, comparison, seed: int, actions: int) -> None:
    header = dedent(
        f"""
        # Huxley–Gödel Machine Demo Report

        *Generated:* {datetime.now(timezone.utc).isoformat()}\\
        *Seed:* {seed} | *Actions:* {actions}

        ## Economic Summary

        | Strategy | GMV ($) | Cost ($) | Profit ($) | ROI |
        | --- | --- | --- | --- | --- |
        | {comparison.hgm.name} | {comparison.hgm.metrics.total_gmv:.2f} | {comparison.hgm.metrics.total_cost:.2f} | {comparison.hgm.metrics.profit:.2f} | {comparison.hgm.metrics.roi:.2f} |
        | {comparison.baseline.name} | {comparison.baseline.metrics.total_gmv:.2f} | {comparison.baseline.metrics.total_cost:.2f} | {comparison.baseline.metrics.profit:.2f} | {comparison.baseline.metrics.roi:.2f} |

        **GMV Lift:** {comparison.lift_percentage:.2f}%

        ## Lineage Explorer

        ```mermaid
        {comparison.hgm.mermaid}
        ```

        ## CMP-guided Event Log
        """
    ).strip()

    hgm_log = "\n".join(f"- {entry}" for entry in comparison.hgm.log)
    baseline_log = "\n".join(f"- {entry}" for entry in comparison.baseline.log)

    body = dedent(
        f"""
        {hgm_log}

        ## Baseline Event Log
        {baseline_log}
        """
    ).strip()

    output_path.write_text(f"{header}\n\n{body}\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the AGI Jobs v0 (v2) Huxley–Gödel Machine demo")
    parser.add_argument("--seed", type=int, default=7, help="Deterministic seed for the simulation")
    parser.add_argument("--actions", type=int, default=42, help="Total scheduling actions to simulate")
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Optional path to save a Markdown report including Mermaid diagrams",
    )
    args = parser.parse_args()

    comparison = run_comparison(seed=args.seed, actions=args.actions)

    print("=" * 72)
    print("Huxley–Gödel Machine Demo :: Empowering AGI Jobs operators")
    print("=" * 72)
    print(comparison.hgm.summary)
    print(comparison.baseline.summary)
    print(f"GMV Lift vs baseline: {comparison.lift_percentage:.2f}%")

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        build_report_markdown(args.report, comparison, args.seed, args.actions)
        print(f"\nDetailed report saved to {args.report}")
    else:
        print("\nHint: provide --report demo.md to generate a fully navigable artefact with Mermaid diagrams.")


if __name__ == "__main__":
    main()
