#!/usr/bin/env python3
"""Owner-friendly configuration controls for the Meta-Agentic α-AGI Jobs Demo V2.

This utility allows a non-technical owner to adjust the scenario configuration using
simple dotted assignments. Examples:

```
python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/owner_controls.py \
  --config demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v2/config/scenario.yaml \
  --set plan.budget.max=550000 \
  --set phases[execute-onchain].step.params.job.reward=150000
```

Assignments support dotted traversal through dictionaries and selection inside lists by
identifier (`phases[execute-onchain]`) or explicit key (`agents[id=guardian-grid-validator]`).
Values are auto-coerced to numbers or booleans where appropriate.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, MutableMapping

import yaml

PathLike = str | Path


def _coerce_value(value: str) -> Any:
    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        if value.startswith("0") and value != "0" and not value.startswith("0."):
            # Preserve strings like addresses that begin with 0x
            int(value, 10)
        return int(value)
    except (ValueError, TypeError):
        pass
    try:
        return float(value)
    except (ValueError, TypeError):
        pass
    return value


def _select_list_entry(collection: list[Any], selector: str) -> MutableMapping[str, Any]:
    if "=" in selector:
        key, identifier = selector.split("=", 1)
    else:
        key, identifier = "id", selector
    for item in collection:
        if isinstance(item, MutableMapping) and str(item.get(key)) == identifier:
            return item
    entry: MutableMapping[str, Any] = {key: identifier}
    collection.append(entry)
    return entry


def _resolve_segment(container: Any, segment: str) -> Any:
    if segment.endswith("]") and "[" in segment:
        name, selector = segment[:-1].split("[", 1)
        if name:
            if name not in container:
                container[name] = []
            target = container[name]
        else:
            target = container
        if not isinstance(target, list):
            raise TypeError(f"Segment `{segment}` expected a list but found `{type(target).__name__}`")
        return _select_list_entry(target, selector)
    if isinstance(container, list):
        index = int(segment)
        while len(container) <= index:
            container.append({})
        return container[index]
    if segment not in container or not isinstance(container[segment], (dict, list)):
        container[segment] = {}
    return container[segment]


def apply_assignment(payload: MutableMapping[str, Any], path: str, value: Any) -> None:
    if not path:
        raise ValueError("Assignment path cannot be empty")
    segments = path.split(".")
    current: Any = payload
    for segment in segments[:-1]:
        current = _resolve_segment(current, segment)
    last = segments[-1]
    if isinstance(current, list):
        index = int(last)
        while len(current) <= index:
            current.append(None)
        current[index] = value
    elif last.endswith("]") and "[" in last:
        target = _resolve_segment(current, last)
        if isinstance(target, MutableMapping):
            target.update(value if isinstance(value, dict) else {"value": value})
        else:
            raise TypeError(f"Cannot assign to selector `{last}`: target is `{type(target).__name__}`")
    else:
        current[last] = value


def load_yaml(path: PathLike) -> MutableMapping[str, Any]:
    payload = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, MutableMapping):
        raise ValueError("Configuration payload must be a mapping")
    return payload


def dump_yaml(payload: MutableMapping[str, Any]) -> str:
    return yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Meta-Agentic α-AGI Jobs owner controls")
    parser.add_argument("--config", required=True, help="Path to the scenario YAML file")
    parser.add_argument(
        "--set",
        dest="assignments",
        action="append",
        default=[],
        metavar="PATH=VALUE",
        help="Apply a configuration override (repeatable).",
    )
    parser.add_argument("--output", help="Optional output path; defaults to in-place overwrite.")
    parser.add_argument("--dry-run", action="store_true", help="Show resulting YAML instead of writing to disk.")
    parser.add_argument("--show", action="store_true", help="Print a JSON summary of the current scenario.")
    return parser


def parse_assignment(text: str) -> tuple[str, Any]:
    if "=" not in text:
        raise ValueError(f"Assignment `{text}` must contain `=`")
    path, raw_value = text.split("=", 1)
    return path.strip(), _coerce_value(raw_value.strip())


def summarise(payload: MutableMapping[str, Any]) -> dict[str, Any]:
    scenario = payload.get("scenario", {})
    treasury = scenario.get("treasury", {})
    return {
        "title": scenario.get("title"),
        "owner": scenario.get("owner", {}).get("address"),
        "guardians": scenario.get("owner", {}).get("guardians", []),
        "treasuryToken": treasury.get("token"),
        "budgetMax": payload.get("plan", {}).get("budget", {}).get("max"),
        "phases": [phase.get("id") for phase in payload.get("phases", [])],
    }


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    config_path = Path(args.config).resolve()
    payload = load_yaml(config_path)

    if args.show and not args.assignments:
        print(json.dumps(summarise(payload), indent=2))
        return 0

    for assignment in args.assignments:
        path, value = parse_assignment(assignment)
        apply_assignment(payload, path, value)

    if args.dry_run or not args.assignments:
        print(dump_yaml(payload))
        return 0

    destination = Path(args.output).resolve() if args.output else config_path
    destination.write_text(dump_yaml(payload), encoding="utf-8")
    print(f"✅ Updated configuration written to {destination}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
