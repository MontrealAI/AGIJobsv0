import asyncio
import json

from kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)
from kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade.simulation import (
    SyntheticEconomySim,
)


def test_simulation_metrics_are_populated() -> None:
    sim = SyntheticEconomySim.from_config({})
    state = sim.get_state()

    expected_keys = {
        "prosperity_index",
        "sustainability_index",
        "nash_welfare",
        "sentient_welfare_index",
        "free_energy",
        "gibbs_free_energy",
        "entropy",
        "hamiltonian",
        "stability_index",
        "coordination_index",
        "game_theory_slack",
        "temperature",
        "enthalpy",
        "pressure",
    }
    assert expected_keys.issubset(state.keys())
    assert 0.0 <= state["prosperity_index"] <= 1.0
    assert 0.0 <= state["sustainability_index"] <= 1.0
    assert 0.0 <= state["stability_index"] <= 1.0
    assert state["entropy"] >= 0.0


def test_emit_status_includes_simulation_snapshot(tmp_path) -> None:
    config = OrchestratorConfig(
        mission_name="omega-k2-test",
        operator_account="operator",
        base_agent_tokens=1e3,
        energy_capacity=1e6,
        compute_capacity=1e6,
        validator_names=[],
        worker_definitions=[],
        checkpoint_dir=tmp_path / "checkpoints",
        status_output_path=tmp_path / "status.jsonl",
        governance_params={},
        simulation_params={"type": "synthetic_economy"},
    )
    orchestrator = Orchestrator(config)
    orchestrator._load_simulation()

    asyncio.run(orchestrator._emit_status())

    snapshot = json.loads(config.status_output_path.read_text(encoding="utf-8").splitlines()[-1])
    assert snapshot["simulation"] is not None
    assert "gibbs_free_energy" in snapshot["simulation"]
