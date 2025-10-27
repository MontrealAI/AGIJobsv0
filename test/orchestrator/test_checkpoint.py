import importlib
import json
import time
from pathlib import Path

import pytest

from orchestrator.checkpoint import (
    CheckpointIntegrityError,
    CheckpointManager,
    FileCheckpointStore,
    GovernanceSettings,
    NodeAssignment,
    ShardState,
)
from orchestrator.models import Budget, OrchestrationPlan, Policies, RunInfo, StatusOut, Step, StepStatus


pytestmark = pytest.mark.filterwarnings(
    "ignore:Exception in thread orchestrator-run:pytest.PytestUnhandledThreadExceptionWarning"
)


def _simple_plan(plan_id: str = "plan-1") -> OrchestrationPlan:
    steps = [
        Step(id="step-1", name="First", kind="llm", params={}),
        Step(id="step-2", name="Second", kind="llm", params={}),
    ]
    return OrchestrationPlan(plan_id=plan_id, steps=steps, budget=Budget(), policies=Policies())


def _simple_status(run_id: str, plan_id: str) -> StatusOut:
    run = RunInfo(id=run_id, plan_id=plan_id, state="pending", created_at=time.time())
    steps = [
        StepStatus(id="step-1", name="First", kind="llm", state="pending"),
        StepStatus(id="step-2", name="Second", kind="llm", state="pending"),
    ]
    return StatusOut(run=run, steps=steps, current=None, logs=[])


def test_checkpoint_roundtrip_preserves_state(tmp_path: Path) -> None:
    checkpoint_path = tmp_path / "checkpoint.json"
    governance = GovernanceSettings.from_metadata({"council": ["0x1"], "quorum": 2, "policy": "v1"})
    store = FileCheckpointStore(checkpoint_path)
    manager = CheckpointManager(store=store, governance=governance)

    shard = ShardState(shard_id="earth", capacity=5, health="healthy", active_jobs=["run-1"], queued_jobs=[])
    node = NodeAssignment(node_id="node-1", shard_id="earth", status="active", active_jobs=["run-1"], last_heartbeat=time.time())
    manager.update_shard(shard)
    manager.update_node(node)

    plan = _simple_plan()
    status = _simple_status("run-1", plan.plan_id)

    checkpoint = manager.snapshot_runtime({"run-1": status}, {"run-1": plan}, scoreboard={"node-1": {"wins": 1}})
    assert checkpoint.integrity == checkpoint.compute_integrity()

    restored_manager = CheckpointManager(store=store, governance=governance)
    restored_jobs = restored_manager.restore_runtime()

    assert "run-1" in restored_jobs
    restored_job = restored_jobs["run-1"]
    assert restored_job.status.run.id == "run-1"
    assert restored_job.plan.plan_id == plan.plan_id
    assert restored_job.assigned_shard == "earth"
    assert restored_job.assigned_nodes == ["node-1"]

    restored_shards = restored_manager.shard_states()
    assert restored_shards["earth"].capacity == 5
    restored_nodes = restored_manager.node_assignments()
    assert restored_nodes["node-1"].status == "active"
    assert restored_manager.governance().policy_hash == governance.policy_hash
    assert restored_manager.last_snapshot() is not None
    assert restored_manager.last_snapshot().scoreboard == {"node-1": {"wins": 1}}


def test_checkpoint_integrity_detection(tmp_path: Path) -> None:
    checkpoint_path = tmp_path / "checkpoint.json"
    store = FileCheckpointStore(checkpoint_path)
    manager = CheckpointManager(store=store, governance=GovernanceSettings.default())
    plan = _simple_plan()
    status = _simple_status("run-2", plan.plan_id)
    manager.snapshot_runtime({"run-2": status}, {"run-2": plan})

    raw = checkpoint_path.read_text(encoding="utf-8")
    tampered = raw.replace("run-2", "run-2-tampered")
    checkpoint_path.write_text(tampered, encoding="utf-8")

    new_manager = CheckpointManager(store=store, governance=GovernanceSettings.default())
    with pytest.raises(CheckpointIntegrityError):
        new_manager.restore_runtime()


class CrashOnceExecutor:
    def __init__(self) -> None:
        self.calls = 0

    def execute(self, step: Step):  # type: ignore[override]
        from orchestrator.tools.executors import StepResult

        self.calls += 1
        if self.calls == 2:
            raise RuntimeError("crash during execution")
        return StepResult(success=True, logs=[f"ran {step.id}"], attempts=1, duration=0.01)


class ResumeExecutor:
    def execute(self, step: Step):  # type: ignore[override]
        from orchestrator.tools.executors import StepResult

        return StepResult(success=True, logs=[f"resume {step.id}"], attempts=1, duration=0.01)


def test_restart_workflow_resumes_mid_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    checkpoint_path = tmp_path / "checkpoint.json"
    state_dir = tmp_path / "state"
    scoreboard_path = tmp_path / "scoreboard.json"
    governance_path = tmp_path / "governance.json"
    governance_payload = {"council": ["0xabc"], "quorum": 1, "policy": "resume"}
    governance_path.write_text(json.dumps(governance_payload), encoding="utf-8")

    monkeypatch.setenv("ORCHESTRATOR_CHECKPOINT_BACKEND", "file")
    monkeypatch.setenv("ORCHESTRATOR_CHECKPOINT_PATH", str(checkpoint_path))
    monkeypatch.setenv("ORCHESTRATOR_STATE_DIR", str(state_dir))
    monkeypatch.setenv("ORCHESTRATOR_SCOREBOARD_PATH", str(scoreboard_path))
    monkeypatch.setenv("ORCHESTRATOR_GOVERNANCE_PATH", str(governance_path))

    runner = importlib.import_module("orchestrator.runner")
    importlib.reload(runner)

    plan = _simple_plan("plan-resume")
    crash_executor = CrashOnceExecutor()
    monkeypatch.setattr(runner, "_EXECUTOR", crash_executor, raising=False)

    run_info = runner.start_run(plan, approvals=[])

    for _ in range(50):
        time.sleep(0.05)
        status = runner.get_status(run_info.id)
        if status.steps[0].state == "completed":
            break
    status = runner.get_status(run_info.id)
    assert status.steps[0].state == "completed"
    assert status.steps[1].state == "running"

    runner_module = importlib.reload(runner)
    resume_executor = ResumeExecutor()
    monkeypatch.setattr(runner_module, "_EXECUTOR", resume_executor, raising=False)
    runner_module.restore_pending_runs()

    for _ in range(60):
        time.sleep(0.05)
        restored_status = runner_module.get_status(run_info.id)
        if restored_status.run.state == "succeeded":
            break
    restored_status = runner_module.get_status(run_info.id)
    assert restored_status.run.state == "succeeded"
    assert all(step.state == "completed" for step in restored_status.steps)

    # Ensure checkpoint sequence advanced after resume
    manager = CheckpointManager(store=FileCheckpointStore(checkpoint_path))
    snapshot = manager.restore_runtime()
    assert run_info.id in snapshot
