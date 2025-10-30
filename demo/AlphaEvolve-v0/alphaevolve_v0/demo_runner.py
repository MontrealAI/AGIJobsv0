"""Entry-point for executing the AlphaEvolve economic uplift demo."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict

from .controller import AlphaEvolveController
from .program_database import ProgramRecord

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "alphaevolve.json"
HEURISTICS_PATH = Path(__file__).resolve().parent / "heuristics.py"
REPORT_PATH = Path(__file__).resolve().parent.parent / "reports" / "alphaevolve_demo_results.json"


def load_config() -> Dict[str, Any]:
    return json.loads(CONFIG_PATH.read_text())


def load_source() -> str:
    return HEURISTICS_PATH.read_text()


def _serialize_record(record: ProgramRecord) -> Dict[str, Any]:
    return {
        "program_id": record.program_id,
        "generation": record.generation,
        "metrics": record.metrics,
        "model_origin": record.model_origin,
    }


def run_demo(generations: int = 15) -> Dict[str, Any]:
    config = load_config()
    source = load_source()
    controller = AlphaEvolveController(source=source, config=config)
    champion: ProgramRecord = asyncio.run(controller.run(generations))
    history = controller.database.history()
    baseline = history[0]
    summary = {
        "generations": generations,
        "baseline": _serialize_record(baseline),
        "champion": _serialize_record(champion),
        "logs": controller.generation_logs,
        "temperature_window": config.get("controller", {}).get("success_window", 12),
        "pareto_front": [
            _serialize_record(record) for record in controller.database.pareto_front(["Utility", "Fairness", "Risk"])
        ],
    }
    REPORT_PATH.write_text(json.dumps(summary, indent=2))
    return summary


__all__ = ["run_demo", "load_config", "load_source"]
