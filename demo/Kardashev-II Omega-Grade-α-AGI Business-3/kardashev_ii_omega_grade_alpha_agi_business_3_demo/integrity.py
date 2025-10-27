"""Mission integrity verification for the Omega-grade demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Literal, Optional, Sequence

from .jobs import JobRecord, JobRegistry, JobStatus
from .resources import ResourceManager
from .scheduler import ScheduledEvent


Severity = Literal["ok", "warning", "error"]


@dataclass(slots=True)
class CheckResult:
    """Outcome of a single integrity check."""

    name: str
    status: Severity
    detail: str
    metrics: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "name": self.name,
            "status": self.status,
            "detail": self.detail,
        }
        if self.metrics:
            payload["metrics"] = dict(self.metrics)
        if self.notes:
            payload["notes"] = list(self.notes)
        return payload


@dataclass(slots=True)
class IntegrityReport:
    """Aggregate integrity status."""

    timestamp: datetime
    passed: bool
    results: List[CheckResult]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "passed": self.passed,
            "results": [result.to_dict() for result in self.results],
            "warnings": sum(result.status == "warning" for result in self.results),
            "errors": sum(result.status == "error" for result in self.results),
        }


class IntegritySuite:
    """Runs a battery of invariants to ensure the mission remains trustworthy."""

    def __init__(
        self,
        job_registry: JobRegistry,
        resources: ResourceManager,
        scheduler: Iterable[ScheduledEvent] | Any,
    ) -> None:
        self._job_registry = job_registry
        self._resources = resources
        self._scheduler = scheduler

    def run(self) -> IntegrityReport:
        """Execute all configured checks and return a rich report."""

        results = [
            self._check_job_graph(),
            self._check_scheduler_queue(),
            self._check_resource_ledger(),
        ]
        passed = all(result.status == "ok" for result in results)
        return IntegrityReport(datetime.now(timezone.utc), passed, results)

    # ------------------------------------------------------------------
    # Individual check implementations
    # ------------------------------------------------------------------
    def _check_job_graph(self) -> CheckResult:
        jobs = list(self._job_registry.iter_jobs())
        if not jobs:
            return CheckResult(
                name="job_graph",
                status="ok",
                detail="Job registry empty; no invariants to verify yet.",
            )

        job_map: Dict[str, JobRecord] = {job.job_id: job for job in jobs}
        missing_parents: List[str] = []
        overdue_jobs: List[str] = []
        now = datetime.now(timezone.utc)

        for job in jobs:
            parent_id = job.spec.parent_id
            if parent_id and parent_id not in job_map:
                missing_parents.append(f"{job.job_id}->{parent_id}")
            if job.status in {JobStatus.POSTED, JobStatus.IN_PROGRESS} and job.spec.deadline < now:
                overdue_jobs.append(job.job_id)

        adjacency: Dict[str, Sequence[str]] = {
            job.job_id: [child.job_id for child in self._job_registry.children_of(job.job_id)]
            for job in jobs
        }
        cycles: List[List[str]] = []

        def _visit(node: str, path: List[str], visited: set[str]) -> None:
            if node in path:
                cycle = path[path.index(node) :] + [node]
                cycles.append(cycle)
                return
            if node in visited:
                return
            visited.add(node)
            path.append(node)
            for child in adjacency.get(node, ()):  # pragma: no cover - defensive guard
                _visit(child, path, visited)
            path.pop()

        visited: set[str] = set()
        for job_id in job_map:
            if job_id not in visited:
                _visit(job_id, [], visited)

        status: Severity = "ok"
        detail = "Job graph healthy."
        notes: List[str] = []
        if missing_parents or cycles:
            status = "error"
            detail = "Job graph inconsistency detected."
            notes.extend(missing_parents[:5])
            if cycles:
                formatted = " -> ".join(cycles[0])
                notes.append(f"cycle:{formatted}")
        elif overdue_jobs:
            status = "warning"
            detail = "Active jobs have exceeded their deadlines."
            notes.extend(overdue_jobs[:5])

        metrics = {
            "jobs": len(jobs),
            "missing_parents": len(missing_parents),
            "cycles": len(cycles),
            "overdue_jobs": len(overdue_jobs),
        }

        return CheckResult("job_graph", status, detail, metrics=metrics, notes=notes)

    def _check_scheduler_queue(self) -> CheckResult:
        # The scheduler implements ``pending_events``/``peek_next``; fall back to
        # iterating directly when a lightweight stub is injected during testing.
        if hasattr(self._scheduler, "pending_events"):
            events: List[ScheduledEvent] = list(self._scheduler.pending_events())  # type: ignore[call-arg]
            next_event: Optional[ScheduledEvent] = (
                self._scheduler.peek_next() if hasattr(self._scheduler, "peek_next") else None
            )
        else:  # pragma: no cover - defensive branch for unexpected schedulers
            events = list(self._scheduler)  # type: ignore[arg-type]
            next_event = min(events, key=lambda evt: evt.execute_at, default=None)

        if not events:
            return CheckResult(
                name="scheduler",
                status="ok",
                detail="No scheduled events pending.",
            )

        job_ids = {job.job_id for job in self._job_registry.iter_jobs()}
        unknown_jobs: List[str] = []
        stale_events: List[str] = []
        now = datetime.now(timezone.utc)
        stale_threshold = now - timedelta(seconds=30)

        for event in events:
            job_id = event.payload.get("job_id")
            if job_id and job_id not in job_ids:
                unknown_jobs.append(f"{event.event_type}:{job_id}")
            if event.execute_at < stale_threshold:
                stale_events.append(event.event_id)

        status: Severity = "ok"
        detail = "Scheduler queue healthy."
        notes: List[str] = []
        if unknown_jobs:
            status = "error"
            detail = "Scheduler references unknown jobs."
            notes.extend(unknown_jobs[:5])
        elif stale_events:
            status = "warning"
            detail = "Scheduler contains overdue events awaiting dispatch."
            notes.extend(stale_events[:5])

        metrics = {
            "pending_events": len(events),
            "stale_events": len(stale_events),
            "unknown_jobs": len(unknown_jobs),
        }
        if next_event is not None:
            metrics["next_event_eta_seconds"] = max(
                0.0, (next_event.execute_at - now).total_seconds()
            )

        return CheckResult("scheduler", status, detail, metrics=metrics, notes=notes)

    def _check_resource_ledger(self) -> CheckResult:
        snapshot = self._resources.to_serializable()
        accounts_payload: Dict[str, Dict[str, Any]]
        if isinstance(snapshot, dict):
            accounts_candidate = snapshot.get("accounts", snapshot)
            if isinstance(accounts_candidate, dict):
                accounts_payload = {
                    name: balances
                    for name, balances in accounts_candidate.items()
                    if isinstance(balances, dict)
                }
            else:
                accounts_payload = {}
            reservations_payload = snapshot.get("reservations", {})
            if not isinstance(reservations_payload, dict):
                reservations_payload = {}
        else:
            accounts_payload = {}
            reservations_payload = {}
        total_tokens = 0.0
        negative_accounts: List[str] = []
        for name, balances in accounts_payload.items():
            tokens = float(balances.get("tokens", 0.0))
            locked = float(balances.get("locked", 0.0))
            if tokens < -1e-9 or locked < -1e-9:
                negative_accounts.append(name)
            total_tokens += tokens + locked

        circulating = self._resources.token_supply + self._resources.locked_supply
        gap = total_tokens - circulating
        energy_available = self._resources.energy_available
        compute_available = self._resources.compute_available
        reservations_total = sum(
            float(payload.get("energy", 0.0)) + float(payload.get("compute", 0.0))
            for payload in reservations_payload.values()
            if isinstance(payload, dict)
        )

        status: Severity = "ok"
        detail = "Resource ledger balanced."
        notes: List[str] = []
        job_ids = {job.job_id for job in self._job_registry.iter_jobs()}
        orphan_reservations = [key for key in reservations_payload if key not in job_ids]
        if (
            negative_accounts
            or energy_available < 0
            or compute_available < 0
            or orphan_reservations
        ):
            status = "error"
            detail = "Resource ledger contains invalid balances."
            notes.extend(negative_accounts[:5])
            if energy_available < 0:
                notes.append("energy_deficit")
            if compute_available < 0:
                notes.append("compute_deficit")
            if orphan_reservations:
                notes.extend([f"orphan_reservation:{orphan_reservations[0]}"])
        elif abs(gap) > 1e-6:
            status = "warning"
            detail = "Circulating token supply does not match account balances."
            notes.append(f"gap={gap:.2f}")

        metrics = {
            "accounts": len(accounts_payload),
            "negative_accounts": len(negative_accounts),
            "circulating_gap": gap,
            "energy_available": energy_available,
            "compute_available": compute_available,
            "token_supply": self._resources.token_supply,
            "locked_supply": self._resources.locked_supply,
            "reservations": len(reservations_payload),
            "reservation_budget": reservations_total,
        }

        return CheckResult("resources", status, detail, metrics=metrics, notes=notes)

