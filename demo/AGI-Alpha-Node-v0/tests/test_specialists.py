from pathlib import Path

from agi_alpha_node.knowledge import KnowledgeLake
from agi_alpha_node.specialists.biotech import BiotechSynthesist
from agi_alpha_node.specialists.finance import FinanceStrategist
from agi_alpha_node.specialists.manufacturing import ManufacturingOptimizer
from agi_alpha_node.specialists.base import SpecialistContext


def _context(tmp_path: Path, planner_goal: str = "maximize") -> SpecialistContext:
    lake = KnowledgeLake(tmp_path / "knowledge.db")
    return SpecialistContext(knowledge=lake, planner_goal=planner_goal)


def test_finance_specialist_records_knowledge(tmp_path: Path) -> None:
    ctx = _context(tmp_path)
    agent = FinanceStrategist(capabilities=["hedging"])
    output = agent.solve({"objective": "Stabilize"}, ctx)
    assert "strategy" in output
    entries = list(ctx.knowledge.export())
    assert any("Finance" in entry["topic"].capitalize() for entry in entries)


def test_biotech_specialist_generates_blueprint(tmp_path: Path) -> None:
    ctx = _context(tmp_path)
    agent = BiotechSynthesist(capabilities=["drug_discovery"])
    result = agent.solve({"objective": "Synthesize"}, ctx)
    assert result["predicted_efficacy"] > 0.7


def test_manufacturing_specialist_improves_throughput(tmp_path: Path) -> None:
    ctx = _context(tmp_path)
    agent = ManufacturingOptimizer(capabilities=["throughput"])
    result = agent.solve({"objective": "Optimize"}, ctx)
    assert result["throughput_gain"] > 0
