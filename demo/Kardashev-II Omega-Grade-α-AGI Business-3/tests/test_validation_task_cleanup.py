import asyncio
from pathlib import Path

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme.config import (
    SupremeDemoConfig,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme.jobs import JobSpec
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme.orchestrator import (
    SupremeOrchestrator,
)


def test_validation_tasks_cleanup(tmp_path: Path) -> None:
    """Ensure background validation tasks are cleaned up after completion.

    Using ``asyncio.run`` keeps the test compatible with the default pytest
    runner while still exercising the async orchestrator API end-to-end.
    """

    async def _exercise_validation_cleanup() -> None:
        config = SupremeDemoConfig(
            checkpoint_path=tmp_path / "state.json",
            log_path=tmp_path / "logs.jsonl",
            bus_history_path=tmp_path / "bus.jsonl",
            owner_control_path=tmp_path / "owner_control.json",
            owner_ack_path=tmp_path / "owner_ack.json",
            structured_metrics_path=tmp_path / "metrics.jsonl",
            mermaid_dashboard_path=tmp_path / "dashboard.mmd",
            job_history_path=tmp_path / "history.jsonl",
            validator_commit_delay_seconds=0,
            validator_reveal_delay_seconds=0,
            enable_simulation=False,
        )
        orchestrator = SupremeOrchestrator(config)

        spec = JobSpec(
            title="Test",
            description="",
            reward=10,
            stake_required=0,
            energy_budget=1.0,
            compute_budget=1.0,
            deadline_epoch=0.0,
            employer="tester",
        )
        job = await orchestrator.post_job(spec)

        await orchestrator.mark_job_complete(job.job_id, "result://demo", 1.0, 1.0)
        # Allow validation tasks to run and cleanup callback to execute.
        await asyncio.gather(*list(orchestrator._validation_tasks))
        await asyncio.sleep(0)

        assert orchestrator._validation_tasks == []

    asyncio.run(_exercise_validation_cleanup())
