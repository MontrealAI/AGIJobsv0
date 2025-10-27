"""Mission dashboard generation utilities."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import asdict, is_dataclass
from threading import Lock
from typing import Any, Dict


class OmegaDashboard:
    """Persist human-friendly mission dashboards and history feeds."""

    def __init__(self, dashboard_path: Path, history_path: Path) -> None:
        self.dashboard_path = dashboard_path
        self.history_path = history_path
        self.dashboard_path.parent.mkdir(parents=True, exist_ok=True)
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        self._history_lock = Lock()
        self._latest_event: Dict[str, Any] | None = None

    def update(self, snapshot: Dict[str, Any]) -> None:
        """Persist the latest orchestrator snapshot."""

        summary = self._build_summary(snapshot)
        dashboard_payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
            "latest_event": self._latest_event,
        }
        self.dashboard_path.write_text(
            json.dumps(self._normalise(dashboard_payload), indent=2, sort_keys=True),
            encoding="utf-8",
        )
        self._append_history(summary)

    def record_event(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        """Capture the most recent bus event for display in the dashboard."""

        self._latest_event = self._normalise({
            "topic": topic,
            "publisher": publisher,
            "payload": payload,
            "received_at": datetime.now(timezone.utc).isoformat(),
        })

    def _append_history(self, summary: Dict[str, Any]) -> None:
        line = json.dumps(summary, sort_keys=True)
        with self._history_lock:
            with self.history_path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")

    def _build_summary(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        jobs = snapshot.get("jobs", {})
        resources = snapshot.get("resources", {})
        governance = snapshot.get("governance", {})
        agents = snapshot.get("agents", {})
        scheduler = snapshot.get("scheduler", {})
        total_jobs = int(jobs.get("total", 0))
        status_counts = jobs.get("status_counts", {})
        completed = int(status_counts.get("finalized", 0)) + int(status_counts.get("completed", 0))
        completion_ratio = 0.0
        if total_jobs:
            completion_ratio = min(1.0, completed / float(total_jobs))
        insight = self._craft_insight(snapshot, completion_ratio)
        return {
            "timestamp": snapshot.get("timestamp"),
            "mission": snapshot.get("mission"),
            "cycle": snapshot.get("cycle"),
            "running": snapshot.get("running"),
            "paused": snapshot.get("paused"),
            "jobs": {
                "total": total_jobs,
                "status_counts": status_counts,
                "active": jobs.get("active_job_ids", []),
            },
            "resources": {
                "energy_available": resources.get("energy_available"),
                "compute_available": resources.get("compute_available"),
                "token_supply": resources.get("token_supply"),
                "locked_supply": resources.get("locked_supply"),
            },
            "governance": governance,
            "agents": {
                "online": [agent for agent, state in agents.get("health", {}).items() if state == "healthy"],
                "unresponsive": agents.get("unresponsive", []),
            },
            "scheduler": scheduler,
            "completion_ratio": completion_ratio,
            "insight": insight,
        }

    def _craft_insight(self, snapshot: Dict[str, Any], completion_ratio: float) -> str:
        mission = snapshot.get("mission", "Omega Mission")
        prosperity = (
            snapshot.get("simulation", {}) or {}
        ).get("prosperity_index", 0.0)
        energy = snapshot.get("resources", {}).get("energy_available", 0.0)
        compute = snapshot.get("resources", {}).get("compute_available", 0.0)
        sentiment = "ascending"
        if completion_ratio >= 0.95:
            sentiment = "victorious"
        elif completion_ratio >= 0.75:
            sentiment = "dominant"
        elif completion_ratio >= 0.5:
            sentiment = "accelerating"
        elif completion_ratio <= 0.2:
            sentiment = "bootstrapping"
        return (
            f"{mission} status: {sentiment}; completion={completion_ratio:.2%}, "
            f"prosperity_index={prosperity:.3f}, energy={energy:,.0f}, compute={compute:,.0f}"
        )

    def _normalise(self, value: Any) -> Any:
        if is_dataclass(value):
            return {key: self._normalise(val) for key, val in asdict(value).items()}
        if isinstance(value, dict):
            return {str(key): self._normalise(val) for key, val in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [self._normalise(item) for item in value]
        if isinstance(value, Path):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if hasattr(value, "total_seconds") and not isinstance(value, (int, float, complex)):
            try:
                return value.total_seconds()
            except Exception:  # pragma: no cover - defensive
                return str(value)
        return value
