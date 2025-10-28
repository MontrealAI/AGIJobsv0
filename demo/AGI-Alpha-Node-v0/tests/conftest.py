from __future__ import annotations

from pathlib import Path
from typing import Iterator
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pytest

from agi_alpha_node.config import Config, load_config


@pytest.fixture()
def config(tmp_path: Path) -> Iterator[Config]:
    template = Path("demo/AGI-Alpha-Node-v0/config/operator.example.yaml").read_text()
    template = template.replace(
        "demo/AGI-Alpha-Node-v0/state/knowledge.jsonl", str(tmp_path / "knowledge.jsonl")
    ).replace(
        "demo/AGI-Alpha-Node-v0/state/logs/agi-alpha-node.log", str(tmp_path / "logs" / "log.jsonl")
    )
    config_path = tmp_path / "operator.yaml"
    config_path.write_text(template)
    yield load_config(config_path)
