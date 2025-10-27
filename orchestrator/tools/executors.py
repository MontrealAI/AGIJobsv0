"""Step executors that bridge orchestration plans to the TypeScript router."""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from ..agents import AgentRegistryError, get_registry
from ..models import Attachment, Step
from ..moderation import ModerationReport, evaluate_step
from ..scoreboard import get_scoreboard
from ..extensions import load_runtime as _load_phase6_runtime

_ROUTER_PATH = Path("packages/orchestrator/src/router.ts")


class StepExecutionError(RuntimeError):
    """Raised when the adapter is unable to complete a step."""


class ModerationRejected(StepExecutionError):
    """Raised when moderation blocks a step."""

    def __init__(self, report: ModerationReport, logs: List[str]) -> None:
        super().__init__("Moderation gate rejected the plan input.")
        self.report = report
        self.logs = logs


@dataclass
class StepResult:
    success: bool
    logs: List[str]
    attempts: int
    duration: float


def _load_router_map() -> Dict[str, str]:
    if not _ROUTER_PATH.exists():
        return {}
    mapping: Dict[str, str] = {}
    for line in _ROUTER_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line.startswith("case ") and ":" in line:
            try:
                intent = line.split("\"")[1]
            except IndexError:
                continue
            if "return" in line:
                target = line.split("return", 1)[1].strip().rstrip(":")
            else:
                target = ""
            mapping[intent] = target
    return mapping


_ROUTER_MAP = _load_router_map()


_STEP_TO_INTENT = {
    "job.post": "create_job",
    "job.apply": "apply_job",
    "job.submit": "submit_work",
    "job.finalize": "finalize",
    "stake.deposit": "stake",
    "stake.withdraw": "withdraw",
    "validator.commit": "validate",
    "validator.dispute": "dispute",
    "governance.set": "admin_set",
}


class _NodeBridge:
    """Lazy wrapper that shells out to the TypeScript runtime when available."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._supported = None  # type: Optional[bool]

    def _is_supported(self) -> bool:
        if self._supported is not None:
            return self._supported
        try:
            subprocess.run(["node", "--version"], check=True, capture_output=True)
            self._supported = True
        except Exception:
            self._supported = False
        return self._supported

    def run(self, intent: str, payload: Dict[str, object]) -> Iterable[str]:
        if not self._is_supported():
            yield f"⚠️ Node runtime unavailable; skipped intent {intent}."
            return
        bridge_script = Path(os.environ.get("ORCHESTRATOR_JS_BRIDGE", "packages/orchestrator/dist/bridge.mjs"))
        if not bridge_script.exists():
            yield f"⚠️ Bridge script missing ({bridge_script}); skipped intent {intent}."
            return
        with self._lock:
            try:
                proc = subprocess.run(
                    ["node", str(bridge_script), intent],
                    input=json.dumps(payload).encode("utf-8"),
                    capture_output=True,
                    check=False,
                )
            except Exception as exc:  # pragma: no cover - shell issues
                raise StepExecutionError(f"Failed to invoke Node bridge: {exc}") from exc
        stdout = proc.stdout.decode("utf-8", errors="ignore").strip()
        stderr = proc.stderr.decode("utf-8", errors="ignore").strip()
        if stderr:
            yield from [line for line in stderr.splitlines() if line]
        if proc.returncode != 0:
            raise StepExecutionError(stdout or f"Node bridge exited with {proc.returncode}")
        for line in stdout.splitlines():
            if line:
                yield line


_NODE_BRIDGE = _NodeBridge()
_SCOREBOARD = get_scoreboard()
_PHASE6_RUNTIME = _load_phase6_runtime()


def _build_payload(step: Step) -> Dict[str, object]:
    payload = {"params": step.params or {}, "metadata": {"tool": step.tool}}
    if step.out and step.out.data:
        payload["out"] = step.out.data
    return payload


def _simulate_adapter(intent: str, step: Step) -> Iterable[str]:
    mapping = _ROUTER_MAP.get(intent)
    yield f"↪︎ Intent `{intent}` mapped to `{mapping or 'unknown target'}`."
    if intent in {"create_job", "stake"}:
        reward = step.params.get("reward") if step.params else None
        yield f"• Prepared payload: {json.dumps(_build_payload(step))}" if reward else "• Prepared payload."  # pragma: no branch
    else:
        yield "• Ready to dispatch payload."


def _extract_agents(step: Step) -> List[str]:
    agents: List[str] = []
    if isinstance(step.params, dict):
        for key in (
            "agent",
            "agentId",
            "agentAddress",
            "validator",
            "student",
            "teacher",
            "recipient",
        ):
            value = step.params.get(key)
            if isinstance(value, str) and value:
                agents.append(value)
    # deduplicate while preserving order
    seen: set[str] = set()
    deduped: List[str] = []
    for agent in agents:
        if agent in seen:
            continue
        seen.add(agent)
        deduped.append(agent)
    return deduped


def _detect_slash(logs: Iterable[str], step: Step, errors: Iterable[str] | None = None) -> tuple[bool, str | None]:
    combined: List[str] = [str(entry) for entry in logs]
    if errors:
        combined.extend(str(entry) for entry in errors)
    for entry in combined:
        lowered = entry.lower()
        if "slash" in lowered or "misconduct" in lowered:
            return True, entry
    if step.tool:
        lowered_tool = step.tool.lower()
        if "slash" in lowered_tool or "dispute" in lowered_tool:
            return True, step.tool
    return False, None


@dataclass
class RetryPolicy:
    attempts: int = 3
    backoff: float = 0.5


class StepExecutor:
    """Execute orchestration steps with retries and compensating actions."""

    def __init__(self, retry: RetryPolicy | None = None) -> None:
        self.retry = retry or RetryPolicy()

    def _attempt(self, step: Step, attempt: int) -> List[str]:
        runtime_logs = _PHASE6_RUNTIME.annotate_step(step)

        if step.tool == "safety.moderation":
            attachments: List[Attachment] = []
            if isinstance(step.params, dict):
                raw_attachments = step.params.get("attachments", [])
                if isinstance(raw_attachments, list):
                    for entry in raw_attachments:
                        if isinstance(entry, Attachment):
                            attachments.append(entry)
                        elif isinstance(entry, dict):
                            try:
                                attachments.append(Attachment.model_validate(entry))
                            except Exception:
                                continue
            report = evaluate_step(step, attachments=attachments)
            logs = [report.summary]
            for term in report.flagged_terms:
                logs.append(f"Flagged term: `{term}`")
            for snippet in report.flagged_passages:
                logs.append(f"Repeated passage: {snippet[:120]}{'…' if len(snippet) > 120 else ''}")
            if report.blocked:
                raise ModerationRejected(report, logs)
            return list(runtime_logs) + logs

        intent = _STEP_TO_INTENT.get(step.tool or "")
        if not intent:
            return list(runtime_logs) + [
                f"No executor registered for tool `{step.tool}`; marking as no-op."
            ]
        payload = _build_payload(step)
        logs: List[str] = list(runtime_logs)
        logs.append(f"Dispatching intent `{intent}` (attempt {attempt}).")
        bridge_preference = os.environ.get("ORCHESTRATOR_BRIDGE_MODE", "auto")
        if bridge_preference == "node":
            logs.extend(_NODE_BRIDGE.run(intent, payload))
        elif bridge_preference == "python":
            logs.extend(_simulate_adapter(intent, step))
        else:
            # auto mode: try node bridge first, fallback to simulation
            try:
                logs.extend(_NODE_BRIDGE.run(intent, payload))
            except StepExecutionError:
                logs.append("Node bridge unavailable, using simulated adapter.")
                logs.extend(_simulate_adapter(intent, step))
        logs.append("Intent completed (logical).")
        return logs

    def execute(self, step: Step) -> StepResult:
        start = time.time()
        errors: List[str] = []
        agents = _extract_agents(step)
        context = step.name or step.tool or step.id
        for attempt in range(1, self.retry.attempts + 1):
            try:
                assignment_logs: List[str] = []
                if agents:
                    try:
                        registry = get_registry()
                        agents, assignment_logs = registry.prepare_step(step, agents)
                    except AgentRegistryError as exc:
                        errors.append(str(exc))
                        failure_logs = assignment_logs + [
                            f"Agent registry error: {exc}.",
                            "Unable to dispatch step without an active agent.",
                        ]
                        return StepResult(False, failure_logs, attempt, time.time() - start)
                logs = assignment_logs + self._attempt(step, attempt)
                _SCOREBOARD.record_result(agents, success=True, context=context)
                slash_detected, descriptor = _detect_slash(logs, step)
                if slash_detected:
                    message = _SCOREBOARD.record_slash(agents, reason=descriptor or "slash")
                    if message:
                        logs.append(message)
                return StepResult(True, logs, attempt, time.time() - start)
            except ModerationRejected as exc:
                failure_logs = list(exc.logs)
                failure_logs.append("Moderation gate blocked execution; escalation required.")
                _SCOREBOARD.record_result(agents, success=False, context=context)
                message = _SCOREBOARD.record_slash(agents, reason="moderation block")
                if message:
                    failure_logs.append(message)
                return StepResult(False, failure_logs, attempt, time.time() - start)
            except StepExecutionError as exc:
                errors.append(str(exc))
                if attempt >= self.retry.attempts:
                    break
                time.sleep(self.retry.backoff * attempt)
        compensate_logs = self.compensate(step, errors)
        _SCOREBOARD.record_result(agents, success=False, context=context)
        slash_detected, descriptor = _detect_slash(compensate_logs, step, errors)
        if slash_detected:
            message = _SCOREBOARD.record_slash(agents, reason=descriptor or (step.tool or "slash"))
            if message:
                compensate_logs.append(message)
        return StepResult(False, compensate_logs, len(errors), time.time() - start)

    def compensate(self, step: Step, errors: List[str]) -> List[str]:
        summary = "; ".join(errors) or "unknown error"
        return [
            f"Compensating `{step.tool}` after failures: {summary}.",
            "Marked step as failed pending operator intervention.",
        ]
