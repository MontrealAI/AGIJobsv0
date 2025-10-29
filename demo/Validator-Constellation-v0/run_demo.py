"""Command-line entry point for the Validator Constellation demo."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from validator_constellation.demo_runner import (
    run_validator_constellation_demo,
    summary_to_dict,
    write_web_artifacts,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Validator Constellation simulation")
    parser.add_argument("--seed", default="demo-seed", help="Entropy seed for VRF committee selection")
    parser.add_argument(
        "--truth",
        choices=["true", "false"],
        default="true",
        help="Truthful outcome for the demo round",
    )
    parser.add_argument("--committee-size", type=int, default=None, help="Override committee size")
    parser.add_argument("--jobs", type=int, default=None, help="Number of jobs to batch into the proof")
    parser.add_argument("--quorum", type=int, default=None, help="Quorum required for truthful outcome")
    parser.add_argument("--commit-blocks", type=int, default=None, help="Commit phase block window")
    parser.add_argument("--reveal-blocks", type=int, default=None, help="Reveal phase block window")
    parser.add_argument(
        "--slash-non-reveal",
        type=float,
        default=None,
        help="Slash fraction for non-revealing validators",
    )
    parser.add_argument(
        "--slash-incorrect",
        type=float,
        default=None,
        help="Slash fraction for incorrect votes",
    )
    parser.add_argument(
        "--budget",
        type=float,
        default=1_000.0,
        help="Sentinel budget threshold before alerts fire",
    )
    parser.add_argument(
        "--owner",
        type=str,
        default=None,
        help="Override the simulated contract owner address",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path to export the summary JSON",
    )
    parser.add_argument(
        "--web-artifacts",
        type=Path,
        default=None,
        help="Directory for exporting web dashboard artefacts (events, summary, owner actions)",
    )
    args = parser.parse_args()
    overrides = {}
    if args.quorum is not None:
        overrides["quorum"] = args.quorum
    if args.commit_blocks is not None:
        overrides["commit_phase_blocks"] = args.commit_blocks
    if args.reveal_blocks is not None:
        overrides["reveal_phase_blocks"] = args.reveal_blocks
    if args.slash_non_reveal is not None:
        overrides["slash_fraction_non_reveal"] = args.slash_non_reveal
    if args.slash_incorrect is not None:
        overrides["slash_fraction_incorrect_vote"] = args.slash_incorrect
    if args.owner is not None:
        overrides["owner_address"] = args.owner
    summary = run_validator_constellation_demo(
        seed=args.seed,
        truthful_outcome=args.truth == "true",
        committee_size=args.committee_size,
        job_count=args.jobs,
        config_overrides=overrides or None,
        budget_limit=args.budget,
    )
    data = summary_to_dict(summary)
    print(json.dumps(data, indent=2))
    if args.output:
        args.output.write_text(json.dumps(data, indent=2))
        print(f"Summary exported to {args.output}")
    if args.web_artifacts:
        manifest = write_web_artifacts(summary, args.web_artifacts)
        print("Web artefacts exported:")
        for label, path in manifest.items():
            print(f"  {label}: {path}")


if __name__ == "__main__":
    main()
