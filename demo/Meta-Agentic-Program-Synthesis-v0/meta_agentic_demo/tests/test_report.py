from __future__ import annotations

import json
from pathlib import Path

from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.orchestrator import SovereignArchitect
from meta_agentic_demo.report import (
    export_batch_report,
    export_report,
    load_mermaid_js,
    render_batch_html,
    render_html,
)


def create_artefacts():
    scenario = DemoScenario(
        identifier="alpha",
        title="Alpha",
        description="",
        target_metric="score",
        success_threshold=0.5,
    )
    config = DemoConfig(scenarios=[scenario])
    architect = SovereignArchitect(config=config)
    return scenario, architect.run(scenario)


def test_render_html_embeds_mermaid(tmp_path: Path) -> None:
    _, artefacts = create_artefacts()
    html = render_html(artefacts)
    assert "mermaid.initialize" in html
    assert "Architecture Atlas" in html
    assert html.count("class=\"mermaid\"") >= 4
    assert "Owner Command Ledger" in html
    assert "Governance Timelock" in html
    assert "Evolutionary Trajectory" in html
    assert "Total Rewards" in html
    assert "Multi-Angle Verification" in html
    assert "Opportunity Intelligence" in html
    assert "Alpha Streamliner" in html
    assert "Holdout" in html
    assert "MAE Consistency" in html
    assert "Bootstrap Interval" in html
    assert "Monotonicity" in html
    assert "Stress Suite" in html
    assert "Stress Scenario" in html
    assert "Holdout suite" in html
    assert "Entropy Shield" in html
    assert "Entropy shield" in html
    assert "Entropy Shield Array" in html
    assert "Residual Skewness" in html
    assert "Residual Kurtosis" in html
    assert "Jackknife Stability" in html
    assert "Distribution Integrity Council" in html
    assert "Resilience Index" in html
    assert artefacts.final_program in html


def test_mermaid_js_is_loaded_once() -> None:
    script_a = load_mermaid_js()
    script_b = load_mermaid_js()
    assert script_a
    assert script_a is script_b


def test_export_batch_report_includes_constellation_dashboard(tmp_path: Path) -> None:
    scenario, artefacts = create_artefacts()
    output_root = tmp_path / "demo_output"
    bundle = export_report(artefacts, output_root)
    batch_bundle = export_batch_report(
        {scenario.identifier: artefacts},
        output_root,
        {scenario.identifier: bundle},
        scenarios={scenario.identifier: scenario},
    )
    assert batch_bundle.json_path.exists()
    assert batch_bundle.html_path.exists()
    payload = json.loads(batch_bundle.json_path.read_text(encoding="utf-8"))
    assert payload["summary"]["completed"] == 1
    assert payload["summary"]["best_identifier"] == scenario.identifier
    assert payload["summary"]["resilience_identifier"] == scenario.identifier
    assert "average_resilience" in payload["summary"]
    html = batch_bundle.html_path.read_text(encoding="utf-8")
    assert "Mission Constellation" in html
    assert scenario.title in html
    assert "Meridian Flow" in html
    assert "Resilience" in html
    inline_html = render_batch_html(
        {scenario.identifier: artefacts},
        payload["summary"],
        {scenario.identifier: bundle},
        output_root,
        {scenario.identifier: scenario},
    )
    assert "Pass rate" in inline_html
    assert "Average Resilience" in inline_html
