#!/usr/bin/env python3
"""Interactive + scriptable console for contract-owner overrides.

This utility gives non-technical operators a guided experience for configuring
`owner_controls` without editing JSON.  It loads the canonical demo
configuration, presents the current control envelope, and emits both CLI flags
and optional override files that can be fed directly into
``make demo-hgm`` or the Python launcher.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import replace
from pathlib import Path
from textwrap import dedent
import sys

# Ensure the demo package is importable regardless of the current working
# directory.  We purposefully avoid sitecustomize reliance so that the console
# can be launched from automation jobs as well.
SCRIPT_PATH = Path(__file__).resolve()
DEMO_ROOT = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[3]
SRC_ROOT = DEMO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from hgm_v0_demo.config_loader import ConfigError, load_config
from hgm_v0_demo.owner_controls import OwnerControls

DEFAULT_CONFIG_PATH = DEMO_ROOT / "config" / "hgm_demo_config.json"

_TOGGLE_TRUE = {"true", "1", "yes", "y", "on"}
_TOGGLE_FALSE = {"false", "0", "no", "n", "off"}


def _parse_toggle(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in _TOGGLE_TRUE:
        return True
    if lowered in _TOGGLE_FALSE:
        return False
    raise argparse.ArgumentTypeError(
        f"Expected one of {sorted(_TOGGLE_TRUE | _TOGGLE_FALSE)}, received '{value}'."
    )


def _apply_option_updates(base: OwnerControls, args: argparse.Namespace) -> tuple[OwnerControls, bool]:
    """Apply non-interactive CLI overrides to ``base``.

    Returns the updated controls together with a flag indicating whether any
    mutation occurred.  This allows ``main`` to decide if interactive prompts
    are necessary.
    """

    updates: dict[str, object] = {}
    changed = False
    if args.pause_all is not None:
        updates["pause_all"] = args.pause_all
    if args.pause_expansions is not None:
        updates["pause_expansions"] = args.pause_expansions
    if args.pause_evaluations is not None:
        updates["pause_evaluations"] = args.pause_evaluations
    if args.clear_max_actions:
        updates["max_actions"] = None
    elif args.max_actions is not None:
        if args.max_actions < 0:
            raise ValueError("--max-actions must be non-negative.")
        updates["max_actions"] = args.max_actions
    if args.clear_note:
        updates["note"] = None
    elif args.note is not None:
        updates["note"] = args.note

    if updates:
        changed = True
        return replace(base, **updates), changed
    return base, changed


def _prompt_bool(label: str, current: bool) -> bool:
    while True:
        choice = input(f"{label} [{ 'Y' if current else 'n' }] » ").strip().lower()
        if not choice:
            return current
        if choice in _TOGGLE_TRUE:
            return True
        if choice in _TOGGLE_FALSE:
            return False
        print("Please enter yes/no (or press enter to keep current value).")


def _prompt_int(label: str, current: int | None) -> int | None:
    suffix = "none" if current is None else str(current)
    while True:
        raw = input(f"{label} (current: {suffix}, blank=keep, 'clear'=none) » ").strip()
        if not raw:
            return current
        if raw.lower() in {"clear", "none"}:
            return None
        try:
            value = int(raw)
        except ValueError:
            print("Enter an integer value or leave blank to keep existing setting.")
            continue
        if value < 0:
            print("Value must be non-negative.")
            continue
        return value


def _prompt_text(label: str, current: str | None) -> str | None:
    suffix = "none" if not current else current
    raw = input(f"{label} (current: {suffix}, blank=keep, 'clear'=none) » ").strip()
    if not raw:
        return current
    if raw.lower() in {"clear", "none"}:
        return None
    return raw


def _interactive_update(base: OwnerControls) -> OwnerControls:
    print("\nInteractive owner console :: adjust HGM scheduling in real time")
    print("----------------------------------------------------------------")
    print(
        dedent(
            f"""
            Current directives:
              • pause_all         = {base.pause_all}
              • pause_expansions  = {base.pause_expansions}
              • pause_evaluations = {base.pause_evaluations}
              • max_actions       = {base.max_actions if base.max_actions is not None else 'none'}
              • note              = {base.note or 'none'}
            """
        ).strip()
    )

    pause_all = _prompt_bool("Pause all scheduling?", base.pause_all)
    pause_expansions = _prompt_bool("Pause expansions?", base.pause_expansions)
    pause_evaluations = _prompt_bool("Pause evaluations?", base.pause_evaluations)
    max_actions = _prompt_int("Maximum number of actions", base.max_actions)
    note = _prompt_text("Owner note", base.note)
    return OwnerControls(
        pause_all=pause_all,
        pause_expansions=pause_expansions,
        pause_evaluations=pause_evaluations,
        max_actions=max_actions,
        note=note,
    )


def _render_summary(new_controls: OwnerControls, base: OwnerControls) -> str:
    if new_controls == base:
        return "Owner controls unchanged."
    mapping = new_controls.to_mapping(include_nulls=True)
    baseline = base.to_mapping(include_nulls=True)
    lines = ["Updated directives:"]
    for key in sorted(set(mapping) | set(baseline)):
        value = mapping.get(key, "<default>")
        baseline_value = baseline.get(key, "<default>")
        if baseline_value == value:
            continue
        lines.append(f"  • {key} = {value!r} (was {baseline_value!r})")
    if len(lines) == 1:
        return "Owner controls unchanged."
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Contract-owner console for the HGM demo")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help=f"Path to the demo configuration (default: {DEFAULT_CONFIG_PATH})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write an overrides JSON file containing owner_controls",
    )
    parser.add_argument("--pause-all", type=_parse_toggle, help="Force pause_all on/off")
    parser.add_argument("--pause-expansions", type=_parse_toggle, help="Force pause_expansions on/off")
    parser.add_argument("--pause-evaluations", type=_parse_toggle, help="Force pause_evaluations on/off")
    parser.add_argument("--max-actions", type=int, help="Set a hard cap on scheduling actions")
    parser.add_argument("--clear-max-actions", action="store_true", help="Remove any max_actions cap")
    parser.add_argument("--note", type=str, help="Set an operator note to surface in reports")
    parser.add_argument("--clear-note", action="store_true", help="Remove the operator note")
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Do not prompt for values if no CLI overrides are provided",
    )

    args = parser.parse_args(argv)

    try:
        config = load_config(args.config)
    except ConfigError as exc:
        print(f"✗ Unable to load configuration: {exc}")
        return 1

    base_controls = OwnerControls.from_mapping(config.owner_controls)
    try:
        updated_controls, changed = _apply_option_updates(base_controls, args)
    except ValueError as exc:
        print(f"✗ {exc}")
        return 1

    if not changed and not args.non_interactive:
        if not sys.stdin.isatty():
            print("No CLI overrides supplied and interactive mode disabled (no TTY detected).")
            return 1
        updated_controls = _interactive_update(base_controls)

    summary = _render_summary(updated_controls, base_controls)
    print("\n" + summary)

    cli_args = updated_controls.to_cli_args(baseline=base_controls)
    if cli_args:
        joined = " ".join(cli_args)
        print("\nInject the overrides into the guided demo with:")
        print(f"  make demo-hgm ARGS=\"{joined}\"")
        print("or call the Python entrypoint:")
        print(
            "  python -m demo.huxley_godel_machine_v0.simulator --output-dir reports/hgm "
            f"{joined}"
        )
    else:
        print("\nNo override flags required; the configuration already reflects your selections.")

    if args.output:
        payload = {"owner_controls": updated_controls.to_mapping()}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nOverrides saved to {args.output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
