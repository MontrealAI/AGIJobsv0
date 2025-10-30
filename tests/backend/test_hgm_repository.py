from __future__ import annotations

import math

from backend.database import get_database
from backend.models.hgm import HgmRepository, seed_demo_run


def test_migrations_create_tables() -> None:
    db = get_database()
    with db.transaction() as cur:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'hgm_%'")
        tables = {row[0] for row in cur.fetchall()}
    assert {
        "hgm_runs",
        "hgm_agents",
        "hgm_agent_performance",
        "hgm_evaluation_outcomes",
        "hgm_schema_migrations",
    }.issubset(tables)


def test_repository_persists_lineage() -> None:
    repo = HgmRepository(get_database())
    repo.ensure_run("run-1", "root", {"label": "Root"})
    repo.ensure_agent("run-1", "root", None, {"label": "Root"})
    repo.record_expansion("run-1", "root/alpha", "root", {"label": "Alpha"})
    repo.record_expansion("run-1", "root/beta", "root", {"label": "Beta"})
    repo.record_evaluation(
        "run-1",
        "root/alpha",
        {"reward": 0.8, "weight": 1.0, "success": True, "cmp": {"weight": 1.0, "mean": 0.8, "variance": 0.0}},
    )
    repo.record_evaluation(
        "run-1",
        "root/beta",
        {"reward": 0.3, "weight": 1.0, "success": False, "cmp": {"weight": 1.0, "mean": 0.3, "variance": 0.0}},
    )
    lineage = repo.fetch_lineage("run-1")
    assert len(lineage) == 1
    root = lineage[0]
    assert root.agent_key == "root"
    assert len(root.children) == 2
    alpha = next(child for child in root.children if child.agent_key.endswith("alpha"))
    beta = next(child for child in root.children if child.agent_key.endswith("beta"))
    assert alpha.performance.visits >= 1.0
    assert beta.performance.visits >= 1.0
    assert alpha.clade_success > 0
    assert beta.clade_failure > 0
    assert root.clade_success >= alpha.clade_success
    assert root.clade_failure >= beta.clade_failure
    evaluations = repo.list_evaluations("run-1", "root/alpha")
    assert evaluations
    assert evaluations[0].success is True


def test_seed_demo_run_populates_sample() -> None:
    repo = HgmRepository(get_database())
    seed_demo_run(repo, run_id="demo")
    lineage = repo.fetch_lineage("demo")
    assert lineage
    alpha = next(child for child in lineage[0].children if child.agent_key.endswith("alpha"))
    assert alpha.children  # deep node present
