"""Regression tests for the Supreme Omega-grade demo wrapper.

The compatibility package under ``demo/kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme``
must expose an ASCII-safe ``main`` callable so that ``run_demo.py`` and other
automation entrypoints can launch the canonical demo without needing the
Unicode-heavy directory name in ``sys.path``. These tests guard against
regressions where ``main`` silently disappears.
"""

from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme import (
    main,
    run_from_cli,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme import (
    run_demo as demo_runner,
)


def test_wrapper_exposes_main_alias():
    """Ensure the compatibility module wires ``main`` to the canonical CLI."""

    assert main is not None
    assert main is run_from_cli


def test_run_demo_accepts_injected_main_fn():
    """Validate the ASCII-safe run helper can execute an injected launcher."""

    captured_args: list[list[str]] = []

    def fake_main(argv):
        captured_args.append(list(argv))

    demo_runner.run(["--alpha", "--beta"], main_fn=fake_main)

    assert captured_args == [["--alpha", "--beta"]]


def test_run_demo_injects_fast_defaults():
    """Ensure default runs finish quickly by injecting short-cycle args."""

    captured_args: list[list[str]] = []

    demo_runner.run(argv=[], main_fn=lambda argv: captured_args.append(list(argv)))

    assert captured_args, "run_demo should supply a default argument set"
    args = captured_args[0]
    assert "--cycles" in args
    assert "--validator_commit_delay_seconds" in args
    assert "--validator_reveal_delay_seconds" in args


def test_status_snapshot_reports_paths(tmp_path):
    """Expose orchestration paths for operator-friendly summaries."""

    from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme import (
        SupremeDemoConfig,
        SupremeOrchestrator,
    )

    config = SupremeDemoConfig(
        cycles=1,
        log_path=tmp_path / "logs.jsonl",
        structured_metrics_path=tmp_path / "metrics.jsonl",
        mermaid_dashboard_path=tmp_path / "dash.mmd",
        job_history_path=tmp_path / "history.jsonl",
        checkpoint_path=tmp_path / "state.json",
        bus_history_path=tmp_path / "bus.jsonl",
        resume_from_checkpoint=False,
    )

    orchestrator = SupremeOrchestrator(config)
    snapshot = orchestrator.status_snapshot()

    assert snapshot["cycles"] == 0
    assert snapshot["jobs_total"] == 0
    assert snapshot["log_path"] == str(config.log_path)
    assert snapshot["dashboard_path"] == str(config.mermaid_dashboard_path)
    assert snapshot["job_history_path"] == str(config.job_history_path)
