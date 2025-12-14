import asyncio
from datetime import timedelta

from kardashev_ii_omega_grade_alpha_agi_business_3.governance import GovernanceParameters
from kardashev_ii_omega_grade_alpha_agi_business_3.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)


def test_orchestrator_respects_cycle_limit(tmp_path):
    """Run the async orchestrator lifecycle under the default pytest runner."""

    async def _run_cycle_limit_check():
        governance = GovernanceParameters(
            validator_commit_window=timedelta(seconds=0.01),
            validator_reveal_window=timedelta(seconds=0.01),
            validator_quorum=1,
        )
        config = OrchestratorConfig(
            checkpoint_path=tmp_path / "checkpoint.json",
            control_channel_file=tmp_path / "control.jsonl",
            enable_simulation=False,
            max_cycles=1,
            cycle_sleep_seconds=0.01,
            insight_interval_seconds=1_000,
            checkpoint_interval_seconds=1_000,
            governance=governance,
        )

        orchestrator = Orchestrator(config)
        await orchestrator.start()

        await asyncio.wait_for(_wait_for_stop(orchestrator), timeout=2)

        assert orchestrator._cycle == config.max_cycles

        await orchestrator.shutdown()

    asyncio.run(_run_cycle_limit_check())


async def _wait_for_stop(orchestrator: Orchestrator) -> None:
    while orchestrator._running:
        await asyncio.sleep(0.01)
