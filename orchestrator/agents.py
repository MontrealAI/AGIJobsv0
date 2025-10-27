"""Registry management for orchestrated agent nodes."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
import time
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from pydantic import BaseModel, ValidationError

from .models import (
    AgentCapability,
    AgentHeartbeatIn,
    AgentListOut,
    AgentRegistrationIn,
    AgentSecurityControls,
    AgentStake,
    AgentStatus,
    AgentUpdateIn,
)

def _default_registry_path() -> Path:
    return Path(os.environ.get("AGENT_REGISTRY_PATH", "storage/orchestrator/agents/registry.json"))


def _default_heartbeat_timeout() -> float:
    return float(os.environ.get("AGENT_HEARTBEAT_TIMEOUT", "120"))


class AgentRegistryError(RuntimeError):
    """Base class for registry interaction failures."""


class AgentNotFoundError(AgentRegistryError):
    """Raised when an agent identifier cannot be resolved."""


class AgentUnauthorizedError(AgentRegistryError):
    """Raised when a provided secret does not match the stored hash."""


class AgentAssignmentError(AgentRegistryError):
    """Raised when no eligible replacement agent can be located."""


class _RegistrySnapshot(BaseModel):
    agents: List[AgentStatus]
    secrets: Dict[str, str]

    @classmethod
    def empty(cls) -> "_RegistrySnapshot":
        return cls(agents=[], secrets={})


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


@dataclass
class AgentAssignment:
    agent: AgentStatus
    replaced: bool
    previous: Optional[str] = None
    reason: Optional[str] = None


class AgentRegistry:
    """Authoritative store for registered agent metadata and runtime health."""

    def __init__(
        self,
        path: Path | None = None,
        heartbeat_timeout: float | None = None,
        watchdog_interval: float | None = None,
    ) -> None:
        self._path = (path or _default_registry_path()).resolve()
        self._heartbeat_timeout = float(heartbeat_timeout or _default_heartbeat_timeout())
        interval = watchdog_interval or max(5.0, self._heartbeat_timeout / 2.0)
        self._watchdog_interval = max(0.5, float(interval))
        self._lock = threading.RLock()
        self._agents: Dict[str, AgentStatus] = {}
        self._secrets: Dict[str, str] = {}
        self._watchdog_started = False
        self._load()
        self._ensure_watchdog()

    # ---------------------------------------------------------------------
    # persistence helpers
    # ------------------------------------------------------------------
    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            snapshot = _RegistrySnapshot.model_validate(data)
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            raise AgentRegistryError(f"Failed to load agent registry: {exc}") from exc
        for entry in snapshot.agents:
            self._agents[entry.agent_id] = entry
        self._secrets = dict(snapshot.secrets)

    def _persist(self) -> None:
        snapshot = _RegistrySnapshot(
            agents=list(self._agents.values()),
            secrets=dict(self._secrets),
        )
        payload = snapshot.model_dump(mode="json")
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        tmp_path.replace(self._path)

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------
    def register(self, payload: AgentRegistrationIn) -> AgentStatus:
        with self._lock:
            if payload.agent_id in self._agents:
                raise AgentRegistryError(f"Agent `{payload.agent_id}` is already registered")
            timestamp = time.time()
            status = AgentStatus(
                agent_id=payload.agent_id,
                owner=payload.owner,
                region=payload.region,
                capabilities=list(payload.capabilities),
                stake=payload.stake,
                security=payload.security,
                router=payload.router,
                status="active",
                registered_at=timestamp,
                updated_at=timestamp,
                last_heartbeat=None,
            )
            self._agents[payload.agent_id] = status
            self._secrets[payload.agent_id] = _hash_secret(payload.operator_secret)
            self._persist()
            return self._with_heartbeat_lag(status)

    def update(self, agent_id: str, payload: AgentUpdateIn) -> AgentStatus:
        with self._lock:
            status = self._agents.get(agent_id)
            if not status:
                raise AgentNotFoundError(f"Agent `{agent_id}` is not registered")
            updated = status.model_copy()
            changed = False
            if payload.region and payload.region != updated.region:
                updated.region = payload.region
                changed = True
            if payload.capabilities is not None:
                updated.capabilities = list(payload.capabilities)
                changed = True
            if payload.stake is not None:
                updated.stake = payload.stake
                changed = True
            if payload.security is not None:
                updated.security = payload.security
                changed = True
            if payload.router is not None:
                updated.router = payload.router
                changed = True
            if payload.status is not None and payload.status != updated.status:
                updated.status = payload.status
                changed = True
            if payload.operator_secret is not None:
                self._secrets[agent_id] = _hash_secret(payload.operator_secret)
                changed = True
            if not changed:
                return self._with_heartbeat_lag(status)
            updated.updated_at = time.time()
            self._agents[agent_id] = updated
            self._persist()
            return self._with_heartbeat_lag(updated)

    def deregister(self, agent_id: str) -> AgentStatus:
        with self._lock:
            status = self._agents.pop(agent_id, None)
            if not status:
                raise AgentNotFoundError(f"Agent `{agent_id}` is not registered")
            self._secrets.pop(agent_id, None)
            self._persist()
            return self._with_heartbeat_lag(status)

    def record_heartbeat(self, agent_id: str, payload: AgentHeartbeatIn) -> AgentStatus:
        with self._lock:
            status = self._agents.get(agent_id)
            if not status:
                raise AgentNotFoundError(f"Agent `{agent_id}` is not registered")
            secret_hash = self._secrets.get(agent_id)
            if secret_hash:
                if not payload.secret:
                    raise AgentUnauthorizedError("Heartbeat secret missing")
                if not hmac.compare_digest(secret_hash, _hash_secret(payload.secret)):
                    raise AgentUnauthorizedError("Heartbeat secret mismatch")
            timestamp = time.time()
            updated = status.model_copy()
            updated.last_heartbeat = timestamp
            updated.updated_at = timestamp
            if updated.status != "suspended":
                updated.status = "active"
            if payload.router is not None:
                updated.router = payload.router
            if payload.capabilities is not None:
                updated.capabilities = list(payload.capabilities)
            self._agents[agent_id] = updated
            self._persist()
            return self._with_heartbeat_lag(updated)

    def get(self, agent_id: str) -> AgentStatus:
        with self._lock:
            status = self._agents.get(agent_id)
            if not status:
                raise AgentNotFoundError(f"Agent `{agent_id}` is not registered")
            return self._with_heartbeat_lag(status)

    def list(self, region: str | None = None, status: str | None = None) -> AgentListOut:
        with self._lock:
            agents = list(self._agents.values())
        filtered: List[AgentStatus] = []
        for entry in agents:
            if region and entry.region != region:
                continue
            if status and entry.status != status:
                continue
            filtered.append(self._with_heartbeat_lag(entry))
        return AgentListOut(agents=filtered, total=len(filtered))

    # ------------------------------------------------------------------
    # assignment helpers
    # ------------------------------------------------------------------
    def prepare_step(self, step: "Step", agent_ids: List[str]) -> Tuple[List[str], List[str]]:
        """Ensure the provided agents are live; replace offline entries if required."""

        from .models import Step  # local import to avoid circular dependency

        if not isinstance(step, Step):  # defensive check for typing
            raise AgentRegistryError("prepare_step received incompatible step instance")

        logs: List[str] = []
        resolved: List[str] = []
        capability_hint = getattr(step, "tool", None) or None
        region_hint: Optional[str] = None
        if isinstance(step.params, dict):
            region_hint = (
                step.params.get("region")
                or step.params.get("preferredRegion")
                or step.params.get("location")
            )

        for agent_id in agent_ids:
            assignment = self._ensure_assignment(agent_id, capability_hint, region_hint)
            resolved.append(assignment.agent.agent_id)
            if assignment.replaced and assignment.previous:
                logs.append(
                    f"Agent `{assignment.previous}` is {assignment.reason or 'unavailable'}; "
                    f"reassigned to `{assignment.agent.agent_id}`."
                )
                self._rewrite_step_params(step, assignment.previous, assignment.agent.agent_id)
        return resolved, logs

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------
    def _ensure_assignment(
        self,
        agent_id: str,
        capability_hint: str | None,
        region_hint: str | None,
    ) -> AgentAssignment:
        with self._lock:
            status = self._agents.get(agent_id)
            if status and self._is_available(status):
                return AgentAssignment(agent=self._with_heartbeat_lag(status), replaced=False)
            reason = "not registered" if not status else status.status
            replacement = self._find_replacement(capability_hint, region_hint, exclude={agent_id})
            if not replacement:
                raise AgentAssignmentError(
                    f"No available agent for `{capability_hint or 'generic'}` in region `{region_hint or 'any'}`"
                )
            return AgentAssignment(
                agent=self._with_heartbeat_lag(replacement),
                replaced=True,
                previous=agent_id,
                reason=reason,
            )

    def _find_replacement(
        self,
        capability_hint: str | None,
        region_hint: str | None,
        exclude: Iterable[str],
    ) -> Optional[AgentStatus]:
        with self._lock:
            candidates = [entry for entry in self._agents.values() if entry.agent_id not in set(exclude)]
        active_candidates = [entry for entry in candidates if self._is_available(entry)]
        if not active_candidates:
            return None

        def _score(entry: AgentStatus) -> Tuple[int, int, Decimal]:
            score_capability = 1 if capability_hint and self._matches_capability(entry, capability_hint) else 0
            score_region = 1 if region_hint and entry.region == region_hint else 0
            stake_amount = entry.stake.amount if isinstance(entry.stake.amount, Decimal) else Decimal(str(entry.stake.amount))
            return (score_capability, score_region, stake_amount)

        active_candidates.sort(key=_score, reverse=True)

        if capability_hint:
            for entry in active_candidates:
                if self._matches_capability(entry, capability_hint):
                    if region_hint and entry.region == region_hint:
                        return entry
            for entry in active_candidates:
                if self._matches_capability(entry, capability_hint):
                    return entry

        if region_hint:
            for entry in active_candidates:
                if entry.region == region_hint:
                    return entry
        return active_candidates[0]

    def _matches_capability(self, entry: AgentStatus, capability_hint: str) -> bool:
        try:
            capability = AgentCapability(capability_hint)
            return capability in entry.capabilities
        except ValueError:
            return capability_hint in {capability.value for capability in entry.capabilities}

    def _is_available(self, entry: AgentStatus) -> bool:
        if entry.status in {"suspended", "offline"}:
            return False
        if not entry.last_heartbeat:
            return entry.status == "active"
        return (time.time() - entry.last_heartbeat) < self._heartbeat_timeout

    def _rewrite_step_params(self, step: "Step", old: str, new: str) -> None:
        if not isinstance(step.params, dict):
            return
        for key in (
            "agent",
            "agentId",
            "agentAddress",
            "validator",
            "student",
            "teacher",
            "recipient",
        ):
            if step.params.get(key) == old:
                step.params[key] = new

    def _with_heartbeat_lag(self, entry: AgentStatus) -> AgentStatus:
        copy = entry.model_copy()
        if copy.last_heartbeat:
            copy.heartbeat_lag_seconds = max(0.0, time.time() - copy.last_heartbeat)
        else:
            copy.heartbeat_lag_seconds = None
        return copy

    # ------------------------------------------------------------------
    # watchdog
    # ------------------------------------------------------------------
    def _ensure_watchdog(self) -> None:
        if self._watchdog_started:
            return

        def _watchdog() -> None:
            interval = self._watchdog_interval
            while True:
                time.sleep(interval)
                with self._lock:
                    dirty = False
                    now = time.time()
                    for agent_id, entry in list(self._agents.items()):
                        if entry.status == "suspended":
                            continue
                        if not entry.last_heartbeat:
                            continue
                        if now - entry.last_heartbeat <= self._heartbeat_timeout:
                            continue
                        updated = entry.model_copy()
                        updated.status = "offline"
                        updated.updated_at = now
                        self._agents[agent_id] = updated
                        dirty = True
                    if dirty:
                        self._persist()

        thread = threading.Thread(target=_watchdog, daemon=True, name="agent-registry-watchdog")
        thread.start()
        self._watchdog_started = True


_REGISTRY_SINGLETON: AgentRegistry | None = None


def get_registry() -> AgentRegistry:
    global _REGISTRY_SINGLETON
    if _REGISTRY_SINGLETON is None:
        _REGISTRY_SINGLETON = AgentRegistry()
    return _REGISTRY_SINGLETON


def reset_registry() -> None:
    global _REGISTRY_SINGLETON
    _REGISTRY_SINGLETON = None
