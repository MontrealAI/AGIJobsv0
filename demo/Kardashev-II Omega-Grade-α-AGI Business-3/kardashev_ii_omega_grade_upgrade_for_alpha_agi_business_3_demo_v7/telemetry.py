"""Mission telemetry writer producing dashboards, job graphs, and JSONL payloads."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List


class MissionTelemetry:
    """Persist structured telemetry, UI payloads, Mermaid diagrams, and job DAG JSON."""

    def __init__(
        self,
        *,
        telemetry_path: Path,
        ui_payload_path: Path,
        mermaid_path: Path,
        max_nodes: int,
        job_graph_path: Path | None = None,
    ) -> None:
        self.telemetry_path = telemetry_path
        self.ui_payload_path = ui_payload_path
        self.mermaid_path = mermaid_path
        self.job_graph_path = job_graph_path
        self.telemetry_path.parent.mkdir(parents=True, exist_ok=True)
        self.ui_payload_path.parent.mkdir(parents=True, exist_ok=True)
        self.mermaid_path.parent.mkdir(parents=True, exist_ok=True)
        if self.job_graph_path is not None:
            self.job_graph_path.parent.mkdir(parents=True, exist_ok=True)
        self._max_nodes = max(1, int(max_nodes))
        self._lock = asyncio.Lock()

    def configure(self, *, max_nodes: int | None = None) -> None:
        if max_nodes is not None:
            self._max_nodes = max(1, int(max_nodes))

    async def record(self, snapshot: Dict[str, Any]) -> None:
        """Write *snapshot* to telemetry, UI payload, Mermaid, and job graph outputs."""

        ui_payload = self._build_ui_payload(snapshot)
        mermaid = self._build_mermaid(snapshot)
        job_graph = self._build_job_graph_payload(snapshot)
        async with self._lock:
            await asyncio.to_thread(
                self._write_payloads,
                snapshot,
                ui_payload,
                mermaid,
                job_graph,
            )

    def _build_ui_payload(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        resources = snapshot.get("resources", {})
        resource_summary = {
            "energy_available": resources.get("energy_available"),
            "energy_capacity": resources.get("energy_capacity"),
            "compute_available": resources.get("compute_available"),
            "compute_capacity": resources.get("compute_capacity"),
            "token_supply": resources.get("token_supply"),
            "locked_supply": resources.get("locked_supply"),
            "energy_price": resources.get("energy_price"),
            "compute_price": resources.get("compute_price"),
        }
        autonomy = snapshot.get("autonomy", {})
        job_records = snapshot.get("job_records", [])
        visible_jobs = job_records[: self._max_nodes]
        truncated = max(0, len(job_records) - len(visible_jobs))
        return {
            "timestamp": snapshot.get("timestamp"),
            "mission": snapshot.get("mission"),
            "cycle": snapshot.get("cycle"),
            "jobs": snapshot.get("jobs"),
            "visible_job_records": visible_jobs,
            "truncated_jobs": truncated,
            "long_run": snapshot.get("long_run"),
            "resources": resource_summary,
            "agents": snapshot.get("agents"),
            "governance": snapshot.get("governance"),
            "integrity": snapshot.get("integrity"),
            "simulation": snapshot.get("simulation"),
            "autonomy": {
                "guardian": autonomy.get("guardian"),
                "resource_governor": autonomy.get("resource_governor"),
            },
            "mission_summary": snapshot.get("mission_summary"),
        }

    def _build_mermaid(self, snapshot: Dict[str, Any]) -> str:
        lines: List[str] = [
            "flowchart TD",
            "    operator[(Operator Treasury)] --> orchestrator{{Ω Orchestrator}}",
        ]
        job_records = snapshot.get("job_records", [])
        limited = job_records[: self._max_nodes]
        truncated = len(job_records) > len(limited)
        id_map: Dict[str, str] = {}
        for index, record in enumerate(limited, start=1):
            job_id = str(record.get("job_id", f"job-{index}"))
            safe_id = f"job_{index}"
            id_map[job_id] = safe_id
            title = str(record.get("title", job_id)).replace("\n", " ")
            status = str(record.get("status", "unknown")).upper()
            label = f"{title}\\n{status}"
            label = label.replace('"', "'")
            lines.append(f"    {safe_id}[\"{label}\"]")
        for record in limited:
            job_id = str(record.get("job_id"))
            parent = record.get("parent_id")
            source = id_map.get(str(parent), "orchestrator") if parent else "orchestrator"
            target = id_map.get(job_id)
            if target:
                lines.append(f"    {source} --> {target}")
        if truncated:
            lines.append("    orchestrator -.-> ellipsis((More jobs...))")
            lines.append("    classDef notice fill:#fdf6e3,stroke:#cb4b16,color:#073642;")
            lines.append("    class ellipsis notice;")
        return "\n".join(lines)

    def _build_job_graph_payload(self, snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
        graph = snapshot.get("job_graph")
        if isinstance(graph, list):
            return graph
        job_records = snapshot.get("job_records", [])
        return [
            {
                "job_id": record.get("job_id"),
                "parent_id": record.get("parent_id"),
                "title": record.get("title"),
                "status": record.get("status"),
                "assigned_agent": record.get("assigned_agent"),
            }
            for record in job_records
        ]

    def _write_payloads(
        self,
        snapshot: Dict[str, Any],
        ui_payload: Dict[str, Any],
        mermaid: str,
        job_graph: List[Dict[str, Any]],
    ) -> None:
        self.telemetry_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
        self.ui_payload_path.write_text(json.dumps(ui_payload, indent=2), encoding="utf-8")
        self.mermaid_path.write_text(mermaid + "\n", encoding="utf-8")
        if self.job_graph_path is not None:
            self.job_graph_path.write_text(json.dumps(job_graph, indent=2), encoding="utf-8")


__all__ = ["MissionTelemetry"]
