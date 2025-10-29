from pathlib import Path

from agi_alpha_node.config import AlphaNodeConfig
from agi_alpha_node.task_router import TaskHarvester


def test_eligible_jobs() -> None:
    config = AlphaNodeConfig.load(Path(__file__).resolve().parents[1] / "config.example.yaml")
    harvester = TaskHarvester(config.jobs, jobs_path=Path(__file__).resolve().parents[1] / "data" / "jobs.json")
    eligible = harvester.eligible_jobs({"finance": 0.9, "biotech": 0.8})
    ids = {job.job_id for job in eligible}
    assert "job-aurora-x" in ids
    assert "job-bioreactor-7" in ids
