from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict

@dataclass
class OrchestratorState:
    jobs: Dict[str, Any]
    resources: Dict[str, Any]
    paused: bool

    def to_json(self) -> str:
        return json.dumps(asdict(self), sort_keys=True, indent=2)

    @classmethod
    def from_json(cls, raw: str) -> "OrchestratorState":
        data = json.loads(raw)
        return cls(**data)


class StateStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def save(self, state: OrchestratorState) -> None:
        tmp_path = self.path.with_suffix(".tmp")
        tmp_path.write_text(state.to_json(), encoding="utf-8")
        os.replace(tmp_path, self.path)

    def load(self) -> OrchestratorState | None:
        if not self.path.exists():
            return None
        return OrchestratorState.from_json(self.path.read_text(encoding="utf-8"))
