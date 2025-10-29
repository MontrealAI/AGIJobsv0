"""Tests for the Meta-Agentic α-AGI Jobs Prime demo."""
from __future__ import annotations

import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.append(str(PACKAGE_ROOT))

from meta_agentic_alpha_prime_demo.config import OwnerControls, load_default_config
from meta_agentic_alpha_prime_demo.orchestrator import MetaAgenticPrimeOrchestrator, run_demo
from meta_agentic_alpha_prime_demo.reports import render_readable_report
from meta_agentic_alpha_prime_demo.ui import generate_html_dashboard


def test_owner_controls_update_validates_inputs() -> None:
    controls = OwnerControls()
    updated = controls.update(max_concurrent_initiatives=8, risk_limit=0.2, allowed_domains=["finance", "energy"])
    assert updated.max_concurrent_initiatives == 8
    assert updated.risk_limit == 0.2
    assert updated.allowed_domains == ("finance", "energy")


def test_orchestrator_produces_full_summary(tmp_path: Path) -> None:
    summary = run_demo(destination=tmp_path / "summary.json")
    assert summary.signals_processed > 0
    assert summary.phase_outputs.identify is not None
    assert summary.phase_outputs.execute is not None
    assert "flowchart TD" in summary.mermaid_diagram

    report_path = tmp_path / "report.md"
    report_path.write_text(render_readable_report(summary), encoding="utf-8")
    assert "Meta-Agentic α-AGI Jobs Prime Demo Summary" in report_path.read_text(encoding="utf-8")

    html = generate_html_dashboard(summary)
    assert "Meta-Agentic α-AGI Jobs Prime Demo" in html
    assert "mermaid" in html


def test_orchestrator_respects_custom_config(tmp_path: Path) -> None:
    cfg = load_default_config({"owner": {"risk_limit": 0.05, "max_concurrent_initiatives": 2}})
    orchestrator = MetaAgenticPrimeOrchestrator(cfg=cfg)
    summary = orchestrator.run()
    assert summary.config_snapshot["owner"]["risk_limit"] == 0.05
    assert len(summary.phase_outputs.identify.opportunities) <= 2  # type: ignore[union-attr]

