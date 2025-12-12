"""
AGI Labor Market Grand Demo runner.

Provides a small CLI to summarize the sample transcript and serve the static
UI contained in this demo. The goal is to make the demo runnable with one
command, matching the expectations set by the other demos in this repository.
"""
from __future__ import annotations

import argparse
import json
import re
import socketserver
import sys
import textwrap
import webbrowser
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parent
UI_DIR = ROOT / "ui"
DEFAULT_TRANSCRIPT = UI_DIR / "sample.json"


def _parse_numeric(value: Any) -> float | None:
    """Extract a numeric value from structured or human-friendly strings."""

    if isinstance(value, list):
        return float(len(value))

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
        if match:
            return float(match.group(0))

    return None


def load_transcript(path: Path = DEFAULT_TRANSCRIPT) -> Dict[str, Any]:
    """Load and minimally validate the transcript JSON file."""

    if not path.exists():
        raise FileNotFoundError(f"Transcript file not found: {path}")

    with path.open("r", encoding="utf-8") as fp:
        data = json.load(fp)

    if not any(key in data for key in ("demo", "market")):
        raise ValueError("Transcript missing required 'demo' or 'market' section")

    return data


def summarize_telemetry(transcript: Dict[str, Any]) -> Dict[str, float]:
    """Summarize telemetry values into normalized numeric metrics."""

    telemetry = transcript.get("demo", {}).get("telemetry") or transcript.get("market", {})

    metrics = {
        "total_jobs": _parse_numeric(telemetry.get("totalJobs")) or 0.0,
        "minted_certificates": _parse_numeric(telemetry.get("mintedCertificates")) or 0.0,
        "total_burned": _parse_numeric(telemetry.get("totalBurned")) or 0.0,
        "final_supply": _parse_numeric(telemetry.get("finalSupply")) or 0.0,
        "total_agent_stake": _parse_numeric(telemetry.get("totalAgentStake")) or 0.0,
        "total_validator_stake": _parse_numeric(telemetry.get("totalValidatorStake")) or 0.0,
        "pending_fees": _parse_numeric(telemetry.get("pendingFees")) or 0.0,
    }

    return metrics


def format_summary(metrics: Dict[str, float]) -> str:
    """Create a human-readable summary block for the transcript."""

    return textwrap.dedent(
        f"""
        🛰️  AGI Labor Market Grand Demo — Telemetry
        • Total jobs: {metrics['total_jobs']:.0f}
        • Minted certificates: {metrics['minted_certificates']:.0f}
        • Final supply: {metrics['final_supply']:.3f} AGIα
        • Total burned: {metrics['total_burned']:.3f} AGIα
        • Agent stake: {metrics['total_agent_stake']:.3f} AGIα
        • Validator stake: {metrics['total_validator_stake']:.3f} AGIα
        • Pending fees: {metrics['pending_fees']:.3f} AGIα
        """
    ).strip()


class QuietHTTPRequestHandler(SimpleHTTPRequestHandler):
    """HTTP handler that keeps console noise to a minimum."""

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        pass


def run_server(port: int, open_browser: bool = True) -> None:
    """Serve the static UI and optionally open the browser."""

    handler = type(
        "DemoHandler",
        (QuietHTTPRequestHandler,),
        {"directory": str(UI_DIR)},
    )

    with socketserver.TCPServer(("", port), handler) as httpd:
        url = f"http://localhost:{port}/"
        print(f"Serving AGI Labor Market Grand Demo UI at {url}")
        if open_browser:
            webbrowser.open_new_tab(url)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down demo server...")
        finally:
            httpd.server_close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the AGI Labor Market Grand Demo utilities",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    summary_parser = subparsers.add_parser(
        "summarize",
        help="Print telemetry derived from the bundled transcript",
    )
    summary_parser.add_argument(
        "--transcript",
        type=Path,
        default=DEFAULT_TRANSCRIPT,
        help="Path to a transcript JSON file (defaults to sample.json)",
    )

    serve_parser = subparsers.add_parser(
        "serve",
        help="Serve the static UI from the ui/ directory",
    )
    serve_parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    serve_parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open a browser tab automatically",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "summarize":
        transcript = load_transcript(args.transcript)
        metrics = summarize_telemetry(transcript)
        print(format_summary(metrics))
        return 0

    if args.command == "serve":
        run_server(port=args.port, open_browser=not args.no_browser)
        return 0

    parser.error("Unknown command")
    return 1


if __name__ == "__main__":
    sys.exit(main())
