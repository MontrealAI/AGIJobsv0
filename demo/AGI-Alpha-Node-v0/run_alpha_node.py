"""Launcher for the AGI Alpha Node demo."""
from __future__ import annotations

import argparse
from pathlib import Path

from alpha_node.cli import main as cli_main


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch the AGI Alpha Node demo")
    parser.add_argument("--config", required=True, help="Configuration file")
    parser.add_argument("--ens-cache", help="Optional ENS cache")
    parser.add_argument("--mode", choices=["cli"], default="cli")
    args = parser.parse_args()
    if args.mode == "cli":
        cli_main(["--config", args.config] + (["--ens-cache", args.ens_cache] if args.ens_cache else []))


if __name__ == "__main__":
    main()
