"""Narrative storyboard generator for non-technical operators."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


class MissionStoryBoard:
    """Render human-friendly mission summaries and maintain history ledgers."""

    def __init__(
        self,
        *,
        storyboard_path: Path,
        history_path: Path,
        history_limit: int,
        insight_path: Path,
        insight_limit: int,
        mission_manifest_path: Path,
        mission_name: str,
    ) -> None:
        self.storyboard_path = storyboard_path
        self.history_path = history_path
        self.insight_path = insight_path
        self.mission_manifest_path = mission_manifest_path
        self.mission_name = mission_name
        for path in (
            storyboard_path,
            history_path,
            insight_path,
            mission_manifest_path,
        ):
            path.parent.mkdir(parents=True, exist_ok=True)
        self._history_limit = max(1, int(history_limit))
        self._insight_limit = max(1, int(insight_limit))
        self._lock = asyncio.Lock()
        self._manifest_written = mission_manifest_path.exists()

    def configure(
        self,
        *,
        history_limit: Optional[int] = None,
        insight_history_limit: Optional[int] = None,
    ) -> None:
        if history_limit is not None:
            self._history_limit = max(1, int(history_limit))
        if insight_history_limit is not None:
            self._insight_limit = max(1, int(insight_history_limit))

    async def capture(self, snapshot: Dict[str, Any]) -> None:
        """Persist a storyboard frame derived from the orchestrator snapshot."""

        story = self._build_story(snapshot)
        insight = self._build_insight(snapshot)
        async with self._lock:
            await asyncio.to_thread(self._persist, story, insight, snapshot)

    def _persist(
        self,
        story: Dict[str, Any],
        insight: Optional[Dict[str, Any]],
        snapshot: Dict[str, Any],
    ) -> None:
        self.storyboard_path.write_text(json.dumps(story, indent=2), encoding="utf-8")
        self._append_history(self.history_path, story, self._history_limit)
        if insight:
            self._append_history(self.insight_path, insight, self._insight_limit)
        if not self._manifest_written:
            self._write_manifest(snapshot)
            self._manifest_written = True

    def _build_story(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        summary = snapshot.get("mission_summary") or {}
        timestamp = snapshot.get("timestamp") or datetime.now(timezone.utc).isoformat()
        guardian = summary.get("guardian_alerts") or []
        resources = snapshot.get("resources", {})
        autonomy = snapshot.get("autonomy", {})
        governor = autonomy.get("resource_governor") or {}
        return {
            "timestamp": timestamp,
            "mission": snapshot.get("mission", self.mission_name),
            "headline": summary.get("headline", "Mission telemetry updating"),
            "phase": summary.get("phase", "assessment"),
            "confidence": summary.get("confidence", 0.0),
            "summary": summary.get("summary", "Telemetry incoming…"),
            "recommended_actions": summary.get("recommended_actions", []),
            "guardian_alerts": guardian,
            "metrics": {
                "outstanding_jobs": summary.get("outstanding_jobs"),
                "jobs_completed": summary.get("jobs_completed"),
                "jobs_failed": summary.get("jobs_failed"),
                "backlog_horizon": summary.get("backlog_horizon"),
                "energy_utilisation": summary.get("energy_utilisation"),
                "compute_utilisation": summary.get("compute_utilisation"),
                "token_pressure": summary.get("token_pressure"),
                "energy_price": governor.get("energy_price"),
                "compute_price": governor.get("compute_price"),
            },
            "resources": {
                "energy_available": resources.get("energy_available"),
                "energy_capacity": resources.get("energy_capacity"),
                "compute_available": resources.get("compute_available"),
                "compute_capacity": resources.get("compute_capacity"),
                "token_supply": resources.get("token_supply"),
                "locked_supply": resources.get("locked_supply"),
            },
        }

    def _build_insight(self, snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        summary = snapshot.get("mission_summary") or {}
        timestamp = snapshot.get("timestamp") or datetime.now(timezone.utc).isoformat()
        actions: List[str] = summary.get("recommended_actions") or []
        guardian = summary.get("guardian_alerts") or []
        if not actions and not guardian:
            return None
        narrative = {
            "timestamp": timestamp,
            "mission": snapshot.get("mission", self.mission_name),
            "confidence": summary.get("confidence", 0.0),
            "actions": actions,
        }
        if guardian:
            narrative["guardian_alerts"] = guardian
        return narrative

    def _append_history(self, path: Path, entry: Dict[str, Any], limit: int) -> None:
        line = json.dumps(entry, separators=(",", ":"))
        if path.exists():
            existing = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
        else:
            existing = []
        existing.append(line)
        retained = existing[-max(1, limit) :]
        path.write_text("\n".join(retained) + "\n", encoding="utf-8")

    def _write_manifest(self, snapshot: Dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        resources = snapshot.get("resources", {})
        manifest = {
            "mission": snapshot.get("mission", self.mission_name),
            "created_at": now,
            "initial_resources": {
                "energy_capacity": resources.get("energy_capacity"),
                "compute_capacity": resources.get("compute_capacity"),
                "token_supply": resources.get("token_supply"),
            },
            "description": (
                "Operator-facing storyboard for the Kardashev-II Ω-grade AGI business mission "
                "showcasing long-horizon autonomy and planetary tokenomics."
            ),
        }
        self.mission_manifest_path.write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )


__all__ = ["MissionStoryBoard"]
