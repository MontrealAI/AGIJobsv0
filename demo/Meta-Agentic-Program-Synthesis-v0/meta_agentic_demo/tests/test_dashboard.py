from pathlib import Path

from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.dashboard import export_dashboard, render_dashboard_html
from meta_agentic_demo.orchestrator import SovereignArchitect
from meta_agentic_demo.report import export_report


def _create_run(tmp_path: Path):
    scenario = DemoScenario(
        identifier="alpha",
        title="Alpha",
        description="",
        target_metric="score",
        success_threshold=0.5,
    )
    config = DemoConfig(scenarios=[scenario])
    architect = SovereignArchitect(config=config)
    artefacts = architect.run(scenario)
    bundle = export_report(artefacts, tmp_path)
    return scenario, artefacts, bundle


def test_render_dashboard_html_contains_constellation_details(tmp_path: Path) -> None:
    scenario, artefacts, _bundle = _create_run(tmp_path / "alpha")
    payload = {
        "missions": [
            {
                "identifier": scenario.identifier,
                "title": scenario.title,
                "score": artefacts.final_score,
                "resilience": artefacts.verification.resilience_index,
                "overall_pass": artefacts.verification.overall_pass,
                "holdout": artefacts.verification.pass_holdout,
                "stress": artefacts.verification.pass_stress,
                "entropy": artefacts.verification.entropy_score,
                "entropy_pass": artefacts.verification.pass_entropy,
                "skewness": artefacts.verification.residual_skewness,
                "skewness_pass": artefacts.verification.pass_skewness,
                "kurtosis": artefacts.verification.residual_kurtosis,
                "kurtosis_pass": artefacts.verification.pass_kurtosis,
                "jackknife_floor": artefacts.verification.jackknife_interval[0],
                "jackknife_ceiling": artefacts.verification.jackknife_interval[1],
                "jackknife_pass": artefacts.verification.pass_jackknife,
                "rewards": artefacts.reward_summary.total_reward,
                "architect": artefacts.reward_summary.architect_total,
                "top_solver": artefacts.reward_summary.top_solver,
                "top_validator": artefacts.reward_summary.top_validator,
                "opportunities": [op.to_dict() for op in artefacts.opportunities],
                "opportunity_count": len(artefacts.opportunities),
                "owner_actions": len(artefacts.owner_actions),
                "timelock_actions": len(artefacts.timelock_actions),
                "links": {
                    "html": "alpha/report.html",
                    "json": "alpha/report.json",
                },
            }
        ],
        "summary": {
            "headline": "Sovereign fleet operational",
            "mission_count": 1,
            "pass_rate": 1.0,
            "average_score": artefacts.final_score,
            "average_resilience": artefacts.verification.resilience_index,
            "best_score_identifier": scenario.identifier,
            "best_resilience_identifier": scenario.identifier,
            "generated_at": artefacts.generated_at.isoformat(timespec="seconds"),
            "architect_retention": 100.0,
            "mermaid": "graph TD; A-->B;",
        },
        "constellation_report": {
            "html": "batch.html",
            "json": "batch.json",
        },
    }
    html = render_dashboard_html(payload)
    assert "Meta-Agentic Command Theatre" in html
    assert scenario.title in html
    assert "Mission Fleet" in html
    assert "Capital & Verification Ledger" in html
    assert "Opportunity Intelligence" in html
    assert "batch.html" in html
    assert "batch.json" in html
    assert "mermaid.initialize" in html
    assert "Jackknife" in html
    assert "Skewness" in html
    assert "Kurtosis" in html


def test_export_dashboard_generates_html_and_json(tmp_path: Path) -> None:
    scenario, artefacts, bundle = _create_run(tmp_path / "alpha")
    dashboard = export_dashboard(
        {scenario.identifier: artefacts},
        output_dir=tmp_path,
        bundles={scenario.identifier: bundle},
        scenarios={scenario.identifier: scenario},
        batch_bundle=None,
    )
    assert dashboard.html_path.exists()
    assert dashboard.json_path.exists()
    html = dashboard.html_path.read_text(encoding="utf-8")
    assert scenario.title in html
    assert "Command theatre".casefold() in html.casefold()
    payload = dashboard.json_path.read_text(encoding="utf-8")
    assert scenario.identifier in payload
    assert "missions" in payload
