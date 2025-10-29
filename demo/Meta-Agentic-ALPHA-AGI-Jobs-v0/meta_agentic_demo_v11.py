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


def _format_path(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Meta-Agentic α-AGI Jobs Demo V11 — Hypergrid")
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to the V11 scenario YAML (defaults to the bundled scenario)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=360.0,
        help="Maximum seconds to wait for the orchestrator run",
    )
    parser.add_argument(
        "--timeout-env",
        default=os.environ.get("META_AGENTIC_DEMO_V11_TIMEOUT"),
        help=argparse.SUPPRESS,
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    _ensure_python_path()
    from meta_agentic_alpha_v11 import (  # pylint: disable=import-error, wrong-import-position
        DEFAULT_CONFIG_PATH,
        run_meta_singularity_demo,
    )

    args = build_parser().parse_args(argv)
    config_path = args.config or DEFAULT_CONFIG_PATH

    timeout = args.timeout
    if args.timeout_env:
        try:
            timeout = float(args.timeout_env)
        except ValueError:
            pass

    outcome = run_meta_singularity_demo(config_path, timeout=timeout)

    metrics = outcome.dashboard_payload["metrics"]
    control = outcome.dashboard_payload["control_surface"]
    ci_v2 = outcome.dashboard_payload.get("ci_v2", {})

    print("\n🎖️ Meta-Agentic α-AGI Jobs Demo V11 completed!")
    print(f"   • Orchestration run ID: {outcome.base.run_id}")
    print(f"   • Run state: {outcome.base.status.run.state}")
    print(f"   • Supremacy index: {metrics['supremacy_index']*100:.2f}%")
    print(f"   • Owner empowerment: {metrics['owner_empowerment']*100:.2f}%")
    print(f"   • Unstoppable readiness: {metrics['unstoppable_readiness']*100:.2f}%")
    print(f"   • Alpha signal strength: {metrics['alpha_signal_strength']*100:.2f}%")
    print(f"   • World-model maturity: {metrics['world_model_maturity']*100:.2f}%")
    print(f"   • Planner intelligence: {metrics['planner_intelligence']*100:.2f}%")
    print(f"   • Execution certainty: {metrics['execution_certainty']*100:.2f}%")
    print(f"   • Meta-CI health: {metrics['meta_ci_health']*100:.2f}% (CI V2 {ci_v2.get('status', 'unknown')})")
    print(f"   • Capital flywheel: {metrics['capital_flywheel_index']*100:.2f}%")
    print(f"   • Expansion thrust: {metrics['expansion_thrust']*100:.2f}%")
    print(
        "   • Guardian control surface: "
        f"{control['guardian_quorum']}/{control['guardian_count']} primary guardians + "
        f"{control['failover_guardian_count']} failover (threshold {control['unstoppable_threshold']*100:.1f}%)"
    )
    print("   • Artefacts generated:")
    print(f"       - Latest run payload: {_format_path(outcome.summary_path)}")
    print(f"       - Dashboard data:    {_format_path(outcome.dashboard_path)}")
    print(f"       - Hypergrid deck:    {_format_path(outcome.report_path)}")
    print(f"       - Scoreboard:        {_format_path(outcome.scoreboard_path)}")

    dashboard_dir = outcome.dashboard_path.parent
    print("\nOpen the Hypergrid Console (V11):")
    print(f"   python -m http.server --directory {_format_path(dashboard_dir)} 9011")
    print("   → Visit http://localhost:9011/index.html")
    print(
        "\nAdjust parameters in meta_agentic_alpha_v11/config/scenario.yaml, rerun this CLI, "
        "and the hypergrid console updates automatically."
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
