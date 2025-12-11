from __future__ import annotations

import json
import os
import pathlib
from dataclasses import dataclass
from typing import Any, Dict

import yaml


@dataclass
class AZRConfig:
    raw: Dict[str, Any]

    @property
    def iterations(self) -> int:
        return int(self.raw["azr"].get("iterations", 50))

    @property
    def tasks_per_iteration(self) -> int:
        return int(self.raw["azr"].get("tasks_per_iteration", 5))

    @property
    def random_seed(self) -> int:
        return int(self.raw["azr"].get("random_seed", 0))

    @property
    def proposer(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("proposer", {}))

    @property
    def solver(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("solver", {}))

    @property
    def buffers(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("buffers", {}))

    @property
    def rewards(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("rewards", {}))

    @property
    def market(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("market", {}))

    @property
    def guardrails(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("guardrails", {}))

    @property
    def telemetry(self) -> Dict[str, Any]:
        return dict(self.raw["azr"].get("telemetry", {}))

    def as_json(self) -> str:
        return json.dumps(self.raw, indent=2)


def load_config(path: str | pathlib.Path | None = None) -> AZRConfig:
    if path is None:
        path = pathlib.Path(__file__).resolve().parent / "config" / "default_config.yaml"
    else:
        path = pathlib.Path(path)
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    if not isinstance(raw, dict) or "azr" not in raw:
        raise ValueError("Invalid AZR configuration: missing 'azr' root key")
    _apply_output_dir_override(raw)
    return AZRConfig(raw=raw)


def _apply_output_dir_override(raw: Dict[str, Any]) -> None:
    """Optionally redirect telemetry output to an isolated directory.

    The demo normally writes reports into ``reports/`` at the repository root.
    During CI and test runs that can pollute the working tree with untracked
    artefacts. If ``AZR_OUTPUT_DIR`` is defined we repoint the telemetry paths
    to that directory while preserving the original filenames.
    """

    output_dir = os.environ.get("AZR_OUTPUT_DIR")
    if not output_dir:
        return

    azr_section = raw.setdefault("azr", {})
    telemetry = azr_section.setdefault("telemetry", {})
    base = pathlib.Path(output_dir)

    report_name = pathlib.Path(telemetry.get("report_path", "absolute_zero_reasoner_report.md")).name
    json_name = pathlib.Path(telemetry.get("json_path", "absolute_zero_reasoner_metrics.json")).name

    telemetry["report_path"] = str(base / report_name)
    telemetry["json_path"] = str(base / json_name)


__all__ = ["AZRConfig", "load_config"]
