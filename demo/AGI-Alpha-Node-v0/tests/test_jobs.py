from pathlib import Path

from alpha_node.jobs import TaskHarvester


def test_task_harvester_file_mode(tmp_path: Path) -> None:
    jobs = tmp_path / "jobs.json"
    jobs.write_text(
        """
[
  {"job_id": "FIN-001", "description": "Finance job", "base_reward": 10, "risk": 0.1, "metadata": {"domain": "finance"}}
]
""",
        encoding="utf-8",
    )
    harvester = TaskHarvester(jobs, loop=False)
    first = harvester.next_job()
    assert first is not None
    assert first.job_id == "FIN-001"
    assert harvester.next_job() is None


def test_task_harvester_loop(tmp_path: Path) -> None:
    jobs = tmp_path / "jobs.json"
    jobs.write_text(
        """
[
  {"job_id": "BIO-001", "description": "Biotech job", "base_reward": 9, "risk": 0.2, "metadata": {"domain": "biotech"}}
]
""",
        encoding="utf-8",
    )
    harvester = TaskHarvester(jobs, loop=True)
    first = harvester.next_job()
    second = harvester.next_job()
    assert first is not None and second is not None
    assert second.job_id == first.job_id
