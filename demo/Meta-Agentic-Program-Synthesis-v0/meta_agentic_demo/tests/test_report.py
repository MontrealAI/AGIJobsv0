from __future__ import annotations

from pathlib import Path

from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.orchestrator import SovereignArchitect
from meta_agentic_demo.report import load_mermaid_js, render_html


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
    return architect.run(scenario)


def test_render_html_embeds_mermaid(tmp_path: Path) -> None:
    artefacts = create_artefacts()
    html = render_html(artefacts)
    assert "mermaid.initialize" in html
    assert "Architecture Atlas" in html
    assert html.count("class=\"mermaid\"") >= 3
    assert "Owner Command Ledger" in html
    assert "Governance Timelock" in html
    assert "Evolutionary Trajectory" in html
    assert artefacts.final_program in html


def test_mermaid_js_is_loaded_once() -> None:
    script_a = load_mermaid_js()
    script_b = load_mermaid_js()
    assert script_a
    assert script_a is script_b
