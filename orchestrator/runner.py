"""Execution engine for orchestration plans with persistence and retries."""

from __future__ import annotations

import threading
import time
import uuid
from typing import Dict, Iterable, List, Optional

from .events import reconcile as reconcile_receipt
from .models import OrchestrationPlan, Receipt, RunInfo, StatusOut, Step, StepStatus
from .scoreboard import get_scoreboard
from .state import RunStateError, RunStateStore, get_store
from .tools import StepExecutor

_RUNS: Dict[str, StatusOut] = {}
_PLANS: Dict[str, OrchestrationPlan] = {}
_LOCK = threading.Lock()
_EXECUTOR = StepExecutor()
_STORE: RunStateStore | None = None
_WATCHDOG_STARTED = False
_STALL_THRESHOLD = 60.0
_WATCHDOG_INTERVAL = 15.0


def _store() -> RunStateStore:
    global _STORE
    if _STORE is None:
        _STORE = get_store()
    return _STORE


def _log(status: StatusOut, message: str) -> None:
    timestamp = time.strftime("%H:%M:%S")
    status.logs.append(f"[{timestamp}] {message}")


def _initial_status(plan: OrchestrationPlan, run_id: Optional[str] = None) -> StatusOut:
    run_identifier = run_id or uuid.uuid4().hex
    steps = [
        StepStatus(id=step.id, name=step.name, kind=step.kind, state="pending")
        for step in plan.steps
    ]
    run = RunInfo(
        id=run_identifier,
        plan_id=plan.plan_id,
        state="pending",
        created_at=time.time(),
        est_budget=plan.budget.max,
    )
    return StatusOut(run=run, steps=steps, current=None, logs=[])


def _apply_transition(status: StatusOut, step: StepStatus, new_state: str, message: str) -> None:
    step.state = new_state  # type: ignore[assignment]
    timestamp = time.time()
    if new_state == "running":
        step.started_at = timestamp
        status.current = step.id
    elif new_state in {"completed", "failed"}:
        step.completed_at = timestamp
        status.current = None if new_state == "completed" else step.id
    _log(status, message)


def _mark_run(status: StatusOut, state: str) -> None:
    status.run.state = state  # type: ignore[assignment]
    now = time.time()
    if not status.run.started_at:
        status.run.started_at = now
    status.run.completed_at = now


def _persist(status: StatusOut) -> None:
    try:
        _store().save(status)
    except RunStateError as exc:  # pragma: no cover - persistence failures should be rare
        _log(status, f"Persistence error: {exc}")


def _resume_pending_steps(plan: OrchestrationPlan, status: StatusOut) -> Iterable[int]:
    for idx, step_status in enumerate(status.steps):
        if step_status.state in {"completed"}:
            continue
        yield idx


def _execute_step(step: Step, status: StatusOut, step_status: StepStatus) -> bool:
    _apply_transition(status, step_status, "running", f"Starting {step.name}")
    _persist(status)
    result = _EXECUTOR.execute(step)
    for line in result.logs:
        _log(status, f"{step.name}: {line}")
    if result.success:
        _apply_transition(status, step_status, "completed", f"Completed {step.name}")
    else:
        _apply_transition(status, step_status, "failed", f"Failed {step.name}")
    _persist(status)
    return result.success


def _finalize_receipt(plan: OrchestrationPlan, status: StatusOut) -> Receipt:
    cids = [step.out.cid for step in plan.steps if step.out and step.out.cid]
    txes = [step.out.tx for step in plan.steps if step.out and step.out.tx]
    receipt = Receipt(
        plan_id=plan.plan_id,
        job_id=None,
        txes=[tx for tx in txes if tx],
        cids=[cid for cid in cids if cid],
        payouts=[],
        timings={"completed_at": time.time()},
    )
    receipt.timings["scoreboard"] = get_scoreboard().snapshot()
    status.receipts = receipt
    return reconcile_receipt(status)


def _ensure_watchdog() -> None:
    global _WATCHDOG_STARTED
    if _WATCHDOG_STARTED:
        return

    def _watchdog() -> None:
        while True:
            time.sleep(_WATCHDOG_INTERVAL)
            with _LOCK:
                runs = list(_RUNS.items())
            for run_id, status in runs:
                if status.run.state != "running" or not status.current:
                    continue
                step = next((s for s in status.steps if s.id == status.current), None)
                if not step or not step.started_at:
                    continue
                if time.time() - step.started_at < _STALL_THRESHOLD:
                    continue
                _log(status, f"Watchdog detected stall in `{step.name}`; rescheduling.")
                plan = _PLANS.get(run_id)
                if not plan:
                    continue
                thread = threading.Thread(
                    target=_resume_run,
                    args=(plan, status, run_id),
                    daemon=True,
                    name=f"orchestrator-resume-{run_id}",
                )
                thread.start()

    thread = threading.Thread(target=_watchdog, daemon=True, name="orchestrator-watchdog")
    thread.start()
    _WATCHDOG_STARTED = True


def _resume_run(plan: OrchestrationPlan, status: StatusOut, run_id: str) -> None:
    with _LOCK:
        _RUNS[run_id] = status
    for idx in _resume_pending_steps(plan, status):
        with _LOCK:
            current_status = _RUNS.get(run_id)
        if not current_status:
            return
        step = plan.steps[idx]
        step_status = current_status.steps[idx]
        if step_status.state == "completed":
            continue
        success = _execute_step(step, current_status, step_status)
        with _LOCK:
            _RUNS[run_id] = current_status
        if not success:
            with _LOCK:
                _mark_run(current_status, "failed")
                _persist(current_status)
                _RUNS[run_id] = current_status
            return
    with _LOCK:
        current_status = _RUNS.get(run_id)
        if not current_status:
            return
        _mark_run(current_status, "succeeded")
        current_status.receipts = _finalize_receipt(plan, current_status)
        _persist(current_status)
        _RUNS[run_id] = current_status


def start_run(plan: OrchestrationPlan, approvals: List[str]) -> RunInfo:
    del approvals
    status = _initial_status(plan)
    with _LOCK:
        _RUNS[status.run.id] = status
        _PLANS[status.run.id] = plan
        _ensure_watchdog()
    _persist(status)

    def _worker() -> None:
        with _LOCK:
            current_status = _RUNS.get(status.run.id)
            if not current_status:
                return
            current_status.run.state = "running"  # type: ignore[assignment]
            current_status.run.started_at = time.time()
            _RUNS[status.run.id] = current_status
            _persist(current_status)
        _resume_run(plan, current_status, status.run.id)

    thread = threading.Thread(target=_worker, daemon=True, name=f"orchestrator-run-{status.run.id}")
    thread.start()
    return status.run


def get_status(run_id: str) -> StatusOut:
    with _LOCK:
        status = _RUNS.get(run_id)
    if status:
        return status
    stored = _store().load(run_id)
    if not stored:
        raise KeyError(run_id)
    with _LOCK:
        _RUNS[run_id] = stored
    return stored
