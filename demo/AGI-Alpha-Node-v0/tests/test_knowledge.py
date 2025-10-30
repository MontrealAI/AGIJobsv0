from pathlib import Path

from agi_alpha_node_demo.knowledge import Insight, KnowledgeLake


def test_knowledge_store_and_query(tmp_path: Path):
    db_path = tmp_path / "knowledge.sqlite3"
    lake = KnowledgeLake(db_path)
    lake.store(Insight(topic="finance", content="Alpha insight", confidence=0.8))
    results = lake.query("finance")
    assert len(results) == 1
    assert results[0].content == "Alpha insight"
