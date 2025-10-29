"""CLI entry point for the Meta-Agentic α-AGI Jobs Prime demo."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

if __package__ in (None, ''):
    import sys
    package_root = Path(__file__).resolve().parent.parent
    sys.path.append(str(package_root))
    from meta_agentic_alpha_prime_demo.orchestrator import ExecutionSummary, run_demo
    from meta_agentic_alpha_prime_demo.reports import render_readable_report, save_report_markdown
    from meta_agentic_alpha_prime_demo.ui import save_dashboard_html
else:
    from .orchestrator import ExecutionSummary, run_demo
    from .reports import render_readable_report, save_report_markdown
    from .ui import save_dashboard_html


def _parse_overrides(pairs: list[str]) -> Dict[str, Any]:
    overrides: Dict[str, Any] = {}
    for pair in pairs:
        if "=" not in pair:
            raise ValueError(f"Override must be in key=value format, received {pair!r}")
        key, value = pair.split("=", 1)
        pointer = overrides
        path = key.split(".")
        for part in path[:-1]:
            pointer = pointer.setdefault(part, {})  # type: ignore[assignment]
            if not isinstance(pointer, dict):
                raise ValueError(f"Override path {key!r} collides with non-dictionary value")
        leaf = path[-1]
        try:
            pointer[leaf] = json.loads(value)
        except json.JSONDecodeError:
            pointer[leaf] = value
    return overrides


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Meta-Agentic α-AGI Jobs Prime demo")
    parser.add_argument("--report", type=Path, help="Path to write the JSON execution summary")
    parser.add_argument("--markdown", type=Path, help="Path to write the Markdown report", required=False)
    parser.add_argument("--dashboard", type=Path, help="Path to write the HTML dashboard", required=False)
    parser.add_argument("--config", type=Path, help="Optional JSON file with configuration overrides")
    parser.add_argument(
        "--override",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="Inline configuration override (dot notation supported)",
    )
    parser.add_argument(
        "--print", action="store_true", dest="print_summary", help="Print Markdown summary to stdout"
    )
    return parser


def main(args: list[str] | None = None) -> ExecutionSummary:
    parser = build_parser()
    parsed = parser.parse_args(args)

    file_overrides: Dict[str, Any] = {}
    if parsed.config:
        file_data = json.loads(parsed.config.read_text())
        if not isinstance(file_data, dict):
            raise TypeError("Config file must contain a JSON object")
        file_overrides = file_data

    inline_overrides = _parse_overrides(parsed.override)
    combined_overrides = {**file_overrides}

    def _deep_update(target: Dict[str, Any], source: Dict[str, Any]) -> Dict[str, Any]:
        for key, value in source.items():
            if isinstance(value, dict) and isinstance(target.get(key), dict):
                target[key] = _deep_update(dict(target[key]), value)  # type: ignore[index]
            else:
                target[key] = value
        return target

    combined_overrides = _deep_update(combined_overrides, inline_overrides)

    summary = run_demo(destination=parsed.report, overrides=combined_overrides)

    if parsed.markdown:
        save_report_markdown(summary, parsed.markdown)
    if parsed.dashboard:
        save_dashboard_html(summary, parsed.dashboard)

    if parsed.print_summary:
        print(render_readable_report(summary))

    return summary


if __name__ == "__main__":
    main()

