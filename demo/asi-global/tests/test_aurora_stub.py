import json
import os
import subprocess
from pathlib import Path

import pytest


@pytest.fixture()
def module_root() -> Path:
    return Path(__file__).resolve().parents[1]


@pytest.fixture()
def mission_config(module_root: Path) -> Path:
    return module_root / "config" / "mission@v2.json"


def run_stub(tmp_path: Path, module_root: Path, mission_path: Path) -> Path:
    network = "integration-net"
    scope = "asi-global-test"
    receipts_dir = tmp_path / "reports" / network / scope / "receipts"

    env = os.environ.copy()
    env.update(
        {
            "NETWORK": network,
            "AURORA_REPORT_SCOPE": scope,
            "AURORA_MISSION_CONFIG": str(mission_path),
            "AURORA_DEPLOY_OUTPUT": str(receipts_dir / "deploy.json"),
        }
    )

    script_path = module_root / "scripts" / "aurora-demo-stub.js"
    subprocess.run(
        ["node", str(script_path)],
        cwd=tmp_path,
        env=env,
        check=True,
    )

    return receipts_dir


def test_stub_writes_receipts(tmp_path: Path, module_root: Path, mission_config: Path) -> None:
    receipts_dir = run_stub(tmp_path, module_root, mission_config)

    expected_files = {
        "mission.json",
        "stake.json",
        "governance.json",
        "postJob.json",
        "submit.json",
        "validate.json",
        "finalize.json",
        "deploy.json",
    }

    for filename in expected_files:
        path = receipts_dir / filename
        assert path.exists(), f"missing receipt {filename}"

    mission = json.loads((receipts_dir / "mission.json").read_text())
    assert mission.get("scope") == "asi-global"
    assert mission.get("jobs"), "mission JSON should contain job definitions"

    deploy = json.loads((receipts_dir / "deploy.json").read_text())
    assert deploy.get("network") == "integration-net"
    assert deploy.get("scope") == "asi-global-test"
    assert "generatedAt" in deploy


@pytest.mark.parametrize(
    "filename",
    [
        "postJob.json",
        "submit.json",
        "validate.json",
        "finalize.json",
    ],
)
def test_receipt_payloads_include_timestamps(
    tmp_path: Path, module_root: Path, mission_config: Path, filename: str
) -> None:
    receipts_dir = run_stub(tmp_path, module_root, mission_config)
    payload = json.loads((receipts_dir / filename).read_text())
    assert "generatedAt" in payload, f"{filename} should include a generatedAt timestamp"
