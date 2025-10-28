from __future__ import annotations

from agi_alpha_node.compliance import ComplianceEngine
from agi_alpha_node.simulation import build_demo_components


def test_compliance_report_generates(config) -> None:
    components = build_demo_components(config)
    engine = ComplianceEngine(
        config=config,
        blockchain=components["blockchain"],
        job_manager=components["job_manager"],
        planner=components["planner"],
        knowledge=components["knowledge"],
    )
    report = engine.run()
    assert 0 <= report.overall_score <= 1
    assert len(report.dimensions) == 6
