"""Interactive configuration console for the OMNI open-endedness demo."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from config_utils import (
    DEFAULT_CONFIG_PATH,
    load_config,
    owner_disabled_tasks,
    parse_scalar,
    save_config,
    set_config_value,
    set_owner_disabled_tasks,
    set_owner_paused,
    summarise,
)


def _print_summary(mapping: dict[str, object]) -> None:
    formatted = json.dumps(mapping, indent=2, sort_keys=True)
    print(formatted)


def _normalise_path(value: str | Path) -> Path:
    return Path(value).expanduser().resolve()


def handle_show(args: argparse.Namespace) -> None:
    config = load_config(args.config, cohort=args.cohort)
    summary = summarise(config.resolved)
    print(f"Configuration @ {config.path}")
    if args.cohort:
        print(f"Cohort overrides applied: {args.cohort}")
    _print_summary(summary)


def handle_set(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    value = parse_scalar(args.value)
    set_config_value(config.raw, args.path, value)
    save_config(config)
    print(f"Set {args.path} to {value!r} in {config.path}")


def handle_disable_task(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    tasks = owner_disabled_tasks(config.raw)
    if args.enable:
        tasks = [task for task in tasks if task != args.task_id]
        action = "enabled"
    else:
        if args.task_id not in tasks:
            tasks.append(args.task_id)
        action = "disabled"
    set_owner_disabled_tasks(config.raw, tasks)
    save_config(config)
    print(f"Task {args.task_id} marked as {action} in {config.path}")


def handle_pause(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    set_owner_paused(config.raw, not args.resume)
    save_config(config)
    state = "paused" if not args.resume else "resumed"
    print(f"Curriculum {state} in {config.path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=_normalise_path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to the OMNI configuration YAML",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    show_parser = subparsers.add_parser("show", help="Print the resolved configuration summary")
    show_parser.add_argument("--cohort", type=str, help="Optional cohort override to apply")
    show_parser.set_defaults(func=handle_show)

    set_parser = subparsers.add_parser("set", help="Set a configuration value using dot notation")
    set_parser.add_argument("path", type=str, help="Dot path to update, e.g. thermostat.roi_target")
    set_parser.add_argument("value", type=str, help="New value (bool/int/float/json auto-detected)")
    set_parser.set_defaults(func=handle_set)

    disable_parser = subparsers.add_parser(
        "disable-task",
        help="Disable a task from the curriculum (or re-enable with --enable)",
    )
    disable_parser.add_argument("task_id", type=str)
    disable_parser.add_argument("--enable", action="store_true", help="Re-enable the specified task")
    disable_parser.set_defaults(func=handle_disable_task)

    pause_parser = subparsers.add_parser("pause", help="Pause or resume the OMNI curriculum")
    pause_parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume the curriculum (default action pauses it)",
    )
    pause_parser.set_defaults(func=handle_pause)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
