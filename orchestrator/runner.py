"""Execution engine for orchestration plans."""

from __future__ import annotations

import threading
import time
import uuid
from typing import Dict, List

from .models import OrchestrationPlan, Receipt, RunInfo, StatusOut, Step, StepStatus

_RUNS: Dict[str, StatusOut] = {}
_LOCK = threading.Lock()


def _initial_status(plan: OrchestrationPlan) -> StatusOut:
    run_id = uuid.uuid4().hex
    steps = [
        StepStatus(id=step.id, name=step.name, kind=step.kind, state="pending")
        for step in plan.steps
    ]
    run = RunInfo(
        id=run_id,
        plan_id=plan.plan_id,
        state="pending",
        created_at=time.time(),
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
    status.logs.append(f"[{time.strftime('%H:%M:%S')}] {message}")


def _mark_run(status: StatusOut, state: str) -> None:
    status.run.state = state  # type: ignore[assignment]
    now = time.time()
    if not status.run.started_at:
        status.run.started_at = now
    status.run.completed_at = now


def _execute_step(step: Step, status: StatusOut, step_status: StepStatus) -> None:
    _apply_transition(status, step_status, "running", f"Starting {step.name}")
    time.sleep(0.05)
    _apply_transition(status, step_status, "completed", f"Completed {step.name}")


def _finalize_receipt(plan: OrchestrationPlan) -> Receipt:
    cids = [step.out.cid for step in plan.steps if step.out and step.out.cid]
    txes = [step.out.tx for step in plan.steps if step.out and step.out.tx]
    return Receipt(
        plan_id=plan.plan_id,
        job_id=None,
        txes=[tx for tx in txes if tx],
        cids=[cid for cid in cids if cid],
        payouts=[],
        timings={"completed_at": time.time()},
    )


def start_run(plan: OrchestrationPlan, approvals: List[str]) -> RunInfo:
    del approvals  # approvals are not used in this stub implementation
    status = _initial_status(plan)
    with _LOCK:
        _RUNS[status.run.id] = status

    def _worker() -> None:
        with _LOCK:
            status.run.state = "running"  # type: ignore[assignment]
            status.run.started_at = time.time()
        for idx, step in enumerate(plan.steps):
            with _LOCK:
                current_status = _RUNS.get(status.run.id)
            if not current_status:
                return
            step_status = current_status.steps[idx]
            _execute_step(step, current_status, step_status)
            with _LOCK:
                _RUNS[status.run.id] = current_status
        with _LOCK:
            status = _RUNS.get(status.run.id)
            if not status:
                return
            _mark_run(status, "succeeded")
            status.receipts = _finalize_receipt(plan)
            _RUNS[status.run.id] = status

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    return status.run


def get_status(run_id: str) -> StatusOut:
    with _LOCK:
        status = _RUNS.get(run_id)
        if not status:
            raise KeyError(run_id)
        return status

