from __future__ import annotations

from hgm_demo.simulation import run_comparison, run_hgm_simulation


def test_hgm_outperforms_baseline() -> None:
    comparison = run_comparison(seed=9, actions=28)
    assert comparison.hgm.metrics.total_gmv > comparison.baseline.metrics.total_gmv
    assert comparison.hgm.metrics.roi >= 1.0


def test_mermaid_diagram_contains_agents() -> None:
    outcome = run_hgm_simulation(seed=3, actions=18)
    assert outcome.mermaid is not None
    assert "graph TD" in outcome.mermaid
    assert "agent-" in outcome.mermaid
