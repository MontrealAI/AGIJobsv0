from __future__ import annotations

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)


def test_status_snapshot_accounts_are_flat() -> None:
    orchestrator = Orchestrator(OrchestratorConfig(enable_simulation=False))
    orchestrator.resources.ensure_account("operator", 125.0)

    snapshot = orchestrator._collect_status_snapshot()

    accounts = snapshot["resources"]["accounts"]
    assert "state" not in accounts
    assert "reservations" not in accounts
    assert accounts["operator"]["tokens"] == 125.0
