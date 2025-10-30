"""CLI entry point for the AlphaEvolve empowerment demo."""

from __future__ import annotations

import argparse
import json

from alphaevolve_v0.demo_runner import REPORT_PATH, run_demo


def main() -> None:
    parser = argparse.ArgumentParser(description="Execute the AlphaEvolve economic uplift demo")
    parser.add_argument("--generations", type=int, default=18, help="Number of generations to run")
    args = parser.parse_args()
    summary = run_demo(args.generations)
    champion = summary["champion"]
    baseline = summary["baseline"]
    print("AlphaEvolve Demo Completed")
    print(f"Baseline Utility: {baseline['metrics']['Utility']:.2f}")
    print(f"Champion Utility: {champion['metrics']['Utility']:.2f}")
    uplift = champion['metrics']['Utility'] - baseline['metrics']['Utility']
    uplift_pct = uplift / max(baseline['metrics']['Utility'], 1e-9) * 100
    print(f"Day-one Utility Uplift: {uplift_pct:.2f}%")
    print(f"Detailed report saved to {REPORT_PATH}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
