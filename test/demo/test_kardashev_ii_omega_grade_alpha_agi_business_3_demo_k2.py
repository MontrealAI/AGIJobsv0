"""Tests for the K2 Omega-grade α-AGI Business 3 demo."""

from __future__ import annotations

from pathlib import Path

from kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2.config import MissionPlan

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = (
    REPO_ROOT
    / "demo"
    / "Kardashev-II Omega-Grade-α-AGI Business-3"
    / "kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2"
    / "config"
    / "mission.json"
)


def test_mission_plan_loads() -> None:
    plan = MissionPlan.load(CONFIG_PATH)
    assert plan.name.startswith("Kardashev-II")
    assert plan.orchestrator_config.initial_jobs
    assert plan.control_channel.name == "control-channel.jsonl"


def test_mermaid_blueprint_has_edges() -> None:
    plan = MissionPlan.load(CONFIG_PATH)
    diagram = plan.mermaid_blueprint()
    assert "graph TD" in diagram
    assert "Dyson_Swarm_Launch" in diagram
    assert "-->" in diagram
def test_ci_smoke(tmp_path: Path) -> None:
    plan = MissionPlan.load(CONFIG_PATH)
    overrides = {
        "max_cycles": 2,
        "cycle_sleep_seconds": 0.01,
        "insight_interval_seconds": 0.02,
        "simulation_tick_seconds": 0.1,
    }

    async def _run() -> None:
        orchestrator = plan.create_orchestrator(checkpoint_dir=tmp_path, overrides=overrides)
        await orchestrator.start()
        try:
            await asyncio.wait_for(orchestrator.wait_until_stopped(), timeout=10.0)
        finally:
            await orchestrator.shutdown()

    import asyncio

    asyncio.run(_run())
    status_file = tmp_path / "status.jsonl"
    assert status_file.exists()
    assert status_file.read_text(encoding="utf-8").strip()
