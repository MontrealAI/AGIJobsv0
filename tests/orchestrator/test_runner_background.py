import time

import pytest

from orchestrator import runner
from orchestrator.models import Budget, OrchestrationPlan, Policies, Step


def test_background_run_preserves_failed_state(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("ORCHESTRATOR_SYNC_RUNS", "0")
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "")
    monkeypatch.setenv("ONEBOX_TEST_FORCE_STUB_WEB3", "0")
    monkeypatch.setenv("ORCHESTRATOR_MODERATION_AUDIT", str(tmp_path / "moderation.log"))

    step = Step(
        id="moderation-block",
        name="Moderation Block",
        kind="validate",
        tool="safety.moderation",
        params={
            "description": (
                "malware exploit ddos ransomware botnet phishing weapon propaganda "
                "malware exploit ddos ransomware botnet phishing weapon propaganda"
            )
        },
    )
    plan = OrchestrationPlan(
        plan_id="plan-background-fail",
        steps=[step],
        budget=Budget(max="0"),
        policies=Policies(),
    )

    run_info = runner.start_run(plan, approvals=[])

    deadline = time.time() + 5
    status = runner.get_status(run_info.id)
    while status.run.state in {"pending", "running"} and time.time() < deadline:
        time.sleep(0.05)
        status = runner.get_status(run_info.id)

    assert status.run.state == "failed"
