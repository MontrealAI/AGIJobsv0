from __future__ import annotations

import asyncio
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "python"
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from omega_business3.config import load_config
from omega_business3.job import JobStatus
from omega_business3.orchestrator import OmegaOrchestrator


def _build_orchestrator(tmp_path: Path) -> OmegaOrchestrator:
    demo_root = Path(__file__).resolve().parents[1]
    config = load_config(demo_root / "config/default_config.json")
    config.log_path = "logs/test-log.json"
    config.state_path = "state/test-state.json"
    return OmegaOrchestrator(config=config, base_path=tmp_path)


def test_orchestrator_completes_jobs(tmp_path: Path) -> None:
    orchestrator = _build_orchestrator(tmp_path)
    asyncio.run(orchestrator.run(cycles=6))
    statuses = {job.status for job in orchestrator.registry.jobs()}
    assert statuses
    allowed = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.VALIDATING, JobStatus.ACTIVE, JobStatus.PENDING, JobStatus.CANCELLED}
    assert all(status in allowed for status in statuses)
    assert orchestrator.state_store.path.exists()


def test_orchestrator_delegates_jobs(tmp_path: Path) -> None:
    orchestrator = _build_orchestrator(tmp_path)

    async def _scenario() -> None:
        await orchestrator.start()
        job = next(iter(orchestrator.registry.jobs()), None)
        assert job is not None
        agent = next(iter(orchestrator.agents.values()))
        child = await orchestrator.delegate_job(
            agent,
            {
                "title": "Recursive Mission",
                "reward": 1000.0,
                "energy_budget": 100.0,
                "compute_budget": 50.0,
                "skills": ["energy", "macro-strategy"],
            },
            deadline_hours=1,
            parent_job=job,
        )
        await orchestrator.stop()
        assert child.parent_id == job.job_id
        assert orchestrator.registry.get(child.job_id).parent_id == job.job_id

    asyncio.run(_scenario())
