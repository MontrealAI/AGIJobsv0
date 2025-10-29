from pathlib import Path

from alpha_node.knowledge import KnowledgeLake
from alpha_node.specialists import BiotechSynthesist, FinanceStrategist, ManufacturingOptimizer


def test_finance_specialist(tmp_path: Path) -> None:
    knowledge = KnowledgeLake(tmp_path / "knowledge.db")
    specialist = FinanceStrategist(knowledge)
    result = specialist.evaluate({"job_id": "job-1", "base_reward": 10.0, "capital_efficiency": 1.5, "risk": 0.2})
    assert result.reward_estimate > 0


def test_biotech_specialist(tmp_path: Path) -> None:
    knowledge = KnowledgeLake(tmp_path / "knowledge.db")
    specialist = BiotechSynthesist(knowledge)
    result = specialist.evaluate({"job_id": "job-2", "novelty": 0.5, "throughput": 1.2})
    assert result.reward_estimate >= 0


def test_manufacturing_specialist(tmp_path: Path) -> None:
    knowledge = KnowledgeLake(tmp_path / "knowledge.db")
    specialist = ManufacturingOptimizer(knowledge)
    result = specialist.evaluate({"job_id": "job-3", "baseline_yield": 0.9, "automation_index": 1.3})
    assert result.reward_estimate > 0
