import argparse
import os
import sys
from pathlib import Path


def _ensure_python_path() -> None:
    base_dir = Path(__file__).resolve().parent
    python_dir = base_dir / "python"
    if python_dir.exists() and str(python_dir) not in sys.path:
        sys.path.insert(0, str(python_dir))
    repo_root = base_dir.parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))


_ensure_python_path()

from meta_agentic_alpha_v10 import (  # noqa: E402  pylint: disable=wrong-import-position
    DEFAULT_CONFIG_PATH,
    run_meta_omni_demo,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Meta-Agentic α-AGI Jobs Demo V10")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to the V10 scenario YAML (defaults to the bundled scenario)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=240.0,
        help="Maximum seconds to wait for the orchestrator run",
    )
    parser.add_argument(
        "--timeout-env",
        default=os.environ.get("META_AGENTIC_DEMO_V10_TIMEOUT"),
        help=argparse.SUPPRESS,
    )
    return parser


def format_path(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    timeout = args.timeout
    if args.timeout_env:
        try:
            timeout = float(args.timeout_env)
        except ValueError:
            pass

    outcome = run_meta_omni_demo(args.config, timeout=timeout)

    metrics = outcome.dashboard_payload["metrics"]
    surface = outcome.dashboard_payload["control_surface"]
    mermaid_payload = outcome.dashboard_payload.get("mermaid", {})

    print("\n👁️✨ Meta-Agentic α-AGI Jobs Demo V10 completed!")
    print(f"   • Orchestration run ID: {outcome.base.run_id}")
    print(f"   • Run state: {outcome.base.status.run.state}")
    print(f"   • Sovereignty index: {metrics['sovereignty_index']*100:.2f}%")
    print(f"   • Unstoppable readiness: {metrics['unstoppable_readiness']*100:.2f}% (target {outcome.mandate.unstoppable_target*100:.2f}%)")
    print(f"   • Owner empowerment: {metrics['owner_empowerment']*100:.2f}%")
    print(f"   • Superintelligence yield: {metrics['superintelligence_yield']*100:.2f}%")
    print(f"   • Alpha conversion: {metrics['alpha_conversion']*100:.2f}%")
    print(f"   • Meta-CI health: {metrics['meta_ci_health']*100:.2f}%")
    print(
        "   • Guardian command surface: "
        f"{surface['guardian_quorum']}/{surface['guardian_count']} primaries + "
        f"{surface['failover_guardian_count']} failover (threshold {surface['unstoppable_threshold']*100:.1f}%)"
    )
    print("   • Artefacts generated:")
    print(f"       - Latest run payload: {format_path(outcome.summary_path)}")
    print(f"       - Dashboard data:    {format_path(outcome.dashboard_path)}")
    print(f"       - Omnidominion deck: {format_path(outcome.report_path)}")
    print(f"       - Scoreboard:        {format_path(outcome.scoreboard_path)}")
    print("   • Mermaid payloads available:")
    for key in sorted(mermaid_payload):
        print(f"       - {key}")

    print("\nOpen the Omnidominion Console (V10):")
    print(f"   python -m http.server --directory {format_path(outcome.dashboard_path.parent)} 9010")
    print("   → Visit http://localhost:9010/index.html")
    print(
        "\nAdjust parameters in meta_agentic_alpha_v10/config/scenario.yaml, rerun this CLI, "
        "and the omnidominion console regenerates instantly."
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
