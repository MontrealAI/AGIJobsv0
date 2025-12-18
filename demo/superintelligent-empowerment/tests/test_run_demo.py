import json
import os
import subprocess
import sys
from pathlib import Path


DEMO_ROOT = Path(__file__).resolve().parents[1]
RUN_DEMO = DEMO_ROOT / "code" / "run_demo.py"
CONFIG = DEMO_ROOT / "configs" / "mission.yaml"


def _run_demo(extra_env: dict[str, str] | None, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)

    return subprocess.run(
        [sys.executable, str(RUN_DEMO), *args],
        text=True,
        capture_output=True,
        env=env,
        cwd=cwd or DEMO_ROOT,
    )


def test_cli_generates_report(tmp_path: Path) -> None:
    output_path = tmp_path / "report.json"
    result = _run_demo(None, "--config", str(CONFIG), "--output", str(output_path))

    assert result.returncode == 0, result.stderr
    payload = json.loads(output_path.read_text())

    assert payload["executive_summary"]
    assert payload["initiatives"]
    assert payload["projected_outcomes"]
    assert payload["generated_at"]


def test_env_defaults_allow_argument_less_run(tmp_path: Path) -> None:
    output_path = tmp_path / "env-report.json"
    env = {
        "SUPER_EMPOWER_CONFIG": str(CONFIG),
        "SUPER_EMPOWER_OUTPUT": str(output_path),
    }

    result = _run_demo(env)

    assert result.returncode == 0, result.stderr
    payload = json.loads(output_path.read_text())

    assert payload["initiatives"], "report should contain synthesized initiatives"
    assert any(item.get("success_metric") for item in payload["initiatives"])
