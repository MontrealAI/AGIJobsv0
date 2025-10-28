"""Command-line entry point for the Validator Constellation demo."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from validator_constellation.demo_runner import run_validator_constellation_demo


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Validator Constellation simulation")
    parser.add_argument("--seed", default="demo-seed", help="Entropy seed for VRF committee selection")
    parser.add_argument(
        "--truth",
        choices=["true", "false"],
        default="true",
        help="Truthful outcome for the demo round",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path to export the summary JSON",
    )
    args = parser.parse_args()
    summary = run_validator_constellation_demo(seed=args.seed, truthful_outcome=args.truth == "true")
    data = {
        "committee": summary.committee,
        "truthfulOutcome": summary.truthful_outcome,
        "roundResult": summary.round_result,
        "slashedValidators": summary.slashed_validators,
        "pausedDomains": summary.paused_domains,
        "batchProofRoot": summary.batch_proof_root,
        "gasSaved": summary.gas_saved,
    }
    print(json.dumps(data, indent=2))
    if args.output:
        args.output.write_text(json.dumps(data, indent=2))
        print(f"Summary exported to {args.output}")


if __name__ == "__main__":
    main()
