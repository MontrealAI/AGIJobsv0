from __future__ import annotations

from agi_alpha_node.knowledge import KnowledgeLake
from agi_alpha_node.specialists import BiotechSpecialist, FinanceSpecialist, ManufacturingSpecialist


def test_specialists_write_to_knowledge(tmp_path) -> None:
    knowledge = KnowledgeLake(tmp_path / "knowledge.jsonl", retention_days=365, max_entries=100)
    finance = FinanceSpecialist(knowledge)
    biotech = BiotechSpecialist(knowledge)
    manufacturing = ManufacturingSpecialist(knowledge)

    for specialist, job_id in zip((finance, biotech, manufacturing), ("FIN-1", "BIO-2", "MAN-3")):
        outcome = specialist.execute({"job_id": job_id, "reward": 1000})
        assert outcome.job_id == job_id

    assert knowledge.count() >= 6
