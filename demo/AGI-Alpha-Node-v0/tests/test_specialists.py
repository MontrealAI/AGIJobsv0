from pathlib import Path

from alpha_node.knowledge import KnowledgeLake, KnowledgeRecord
from alpha_node.specialists import (
    BiotechSynthesist,
    FinanceStrategist,
    ManufacturingOptimizer,
)


def _lake(tmp_path: Path) -> KnowledgeLake:
    lake_path = tmp_path / "knowledge.json"
    return KnowledgeLake(lake_path)


def test_finance_specialist(tmp_path: Path) -> None:
    lake = _lake(tmp_path)
    lake.add(KnowledgeRecord(job_id="a", domain="finance", insight="i", reward_delta=2.0))
    agent = FinanceStrategist(name="finance", description="", risk_limit=2.5)
    result = agent.execute("job", {"capital_multiplier": 1.5}, lake)
    assert result.reward_delta > 0
    assert result.domain == "finance"


def test_biotech_specialist(tmp_path: Path) -> None:
    lake = _lake(tmp_path)
    agent = BiotechSynthesist(name="biotech", description="", risk_limit=1.0)
    result = agent.execute("job", {"synthesis_efficiency": 2.0}, lake)
    assert result.reward_delta > 0
    assert result.domain == "biotech"


def test_manufacturing_specialist(tmp_path: Path) -> None:
    lake = _lake(tmp_path)
    agent = ManufacturingOptimizer(name="manufacturing", description="", risk_limit=1.2)
    result = agent.execute("job", {"throughput": 100, "waste_reduction": 0.1}, lake)
    assert result.reward_delta > 0
    assert result.domain == "manufacturing"
