from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from . import run_cli


_DEFAULT_CONFIG = Path("demo/Huxley-Godel-Machine-v0/config/hgm_demo_config.json")
_DEFAULT_OUTPUT = Path("demo/Huxley-Godel-Machine-v0/reports")
_DEFAULT_UI = Path("demo/Huxley-Godel-Machine-v0/web/artifacts/comparison.json")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Huxley–Gödel Machine demo simulation with baseline comparison",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=_DEFAULT_CONFIG,
        help="Path to the simulation configuration file.",
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
        default=_DEFAULT_OUTPUT,
        help="Directory where artefacts (timelines, summaries) will be written.",
    )
    parser.add_argument(
        "--ui-artifact",
        type=Path,
        default=_DEFAULT_UI,
        help="Path to the JSON artefact consumed by the web viewer.",
    )
    parser.add_argument(
        "--set",
        dest="overrides",
        action="append",
        default=[],
        metavar="PATH=VALUE",
        help="Override configuration entries using dotted paths (values parsed as JSON).",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.ui_artifact is not None:
        args.ui_artifact.parent.mkdir(parents=True, exist_ok=True)

    run_cli(
        config=args.config,
        output_dir=args.output_dir,
        seed=args.seed,
        overrides=args.overrides,
        ui_artifact=args.ui_artifact,
    )


if __name__ == "__main__":
    main()
