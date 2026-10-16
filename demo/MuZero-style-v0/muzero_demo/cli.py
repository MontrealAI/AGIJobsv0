"""Command-line interface for MuZero demo."""

from __future__ import annotations

import argparse


# Preserve the established callable API without importing the training stack for help.
def __getattr__(name):
    if name in {
        "run_demo",
        "run_smoke_tests",
        "run_eval",
        "load_config",
        "prepare_device",
    }:
        from . import cli_runtime

        return getattr(cli_runtime, name)
    raise AttributeError(name)


parser = argparse.ArgumentParser(description="MuZero-style AGI Jobs demo")
subparsers = parser.add_subparsers(dest="command")

demo_parser = subparsers.add_parser(
    "demo", help="Train and evaluate the MuZero planner"
)
demo_parser.add_argument("--config", required=True, help="Path to configuration YAML")

smoke_parser = subparsers.add_parser("smoke-tests", help="Run smoke tests for the demo")
smoke_parser.add_argument("--config", required=True, help="Path to configuration YAML")

eval_parser = subparsers.add_parser("eval", help="Evaluate strategies only")
eval_parser.add_argument("--config", required=True, help="Path to configuration YAML")


def app(argv: list[str] | None = None) -> None:
    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        return
    try:
        from . import cli_runtime
    except ModuleNotFoundError as exc:
        if exc.name not in {"torch", "numpy", "yaml"}:
            raise
        parser.exit(
            2,
            f"MuZero runtime dependency '{exc.name}' is missing. "
            "Install PyTorch for your platform and demo/MuZero-style-v0/requirements.txt in a dedicated environment, "
            "then retry this command. No training was started.\n",
        )
    commands = {
        "demo": cli_runtime.run_demo,
        "smoke-tests": cli_runtime.run_smoke_tests,
        "eval": cli_runtime.run_eval,
    }
    commands[args.command](args.config)


if __name__ == "__main__":
    app()
