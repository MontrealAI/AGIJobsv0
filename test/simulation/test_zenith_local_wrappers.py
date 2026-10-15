"""Local wrapper safety tests use a private fixture and stub all chain execution."""

from pathlib import Path
import os
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
WRAPPERS = [
    ("global-governance", "zenith-sapience", "zenith-sapience"),
    (
        "celestial-archon-governance",
        "zenith-celestial-archon",
        "zenith-celestial-archon",
    ),
    ("omnidominion-governance", "zenith-omnidominion", "zenith-omnidominion"),
    (
        "planetary-operating-system-governance",
        "zenith-planetary-os",
        "zenith-planetary-os",
    ),
]


def fixture(tmp_path, kind, launcher):
    root = tmp_path / "repo"
    root.mkdir()
    relative = Path(f"demo/zenith-sapience-initiative-{kind}/bin/{launcher}-local.sh")
    target = root / relative
    target.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / relative, target)
    helper = Path("demo/aurora/bin/prepare-local-reports.cjs")
    (root / helper).parent.mkdir(parents=True)
    shutil.copyfile(ROOT / helper, root / helper)
    for name in ("local-node.sh", "local-demo-lock.py"):
        shutil.copyfile(
            ROOT / "demo/aurora/bin" / name, root / "demo/aurora/bin" / name
        )
    bins = tmp_path / "bin"
    bins.mkdir()
    npm = bins / "npm"
    npm.write_text('#!/bin/sh\nprintf "%s\\n" "$NETWORK" > "$NPM_CALLED"\n')
    npm.chmod(0o700)
    env = {
        **os.environ,
        "PATH": str(bins) + os.pathsep + os.environ["PATH"],
        "NPM_CALLED": str(tmp_path / "npm-called"),
    }
    for key in ("ASI_GLOBAL_PLAN_PATH", "AURORA_MISSION_CONFIG"):
        env.pop(key, None)
    return root, target, env


@pytest.mark.parametrize("kind,launcher,scope", WRAPPERS)
@pytest.mark.parametrize("plan_value", ["", " ", "project-plan.json", "missing.json"])
def test_ignored_plan_override_rejected_before_locks_reports_or_execution(
    tmp_path, kind, launcher, scope, plan_value
):
    root, script, env = fixture(tmp_path, kind, launcher)
    reports = root / "reports/localhost" / scope
    reports.mkdir(parents=True)
    (reports / "sentinel").write_text("original evidence")
    marker = tmp_path / "early-process-called"
    # Catch lock acquisition, report preparation and downstream execution without
    # letting a regression start any real process or chain.
    for command in ("python3", "node", "npm"):
        stub = tmp_path / "bin" / command
        stub.write_text(
            '#!/bin/sh\nprintf "%s\\n" "$0" >> "$EARLY_PROCESS_CALLED"\nexit 97\n'
        )
        stub.chmod(0o700)
    result = subprocess.run(
        ["bash", str(script)],
        env={
            **env,
            "NETWORK": "localhost",
            "ASI_GLOBAL_PLAN_PATH": plan_value,
            "AURORA_MISSION_CONFIG": "reviewed-mission.json",
            "EARLY_PROCESS_CALLED": str(marker),
        },
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 1
    assert "ASI_GLOBAL_PLAN_PATH is unsupported" in result.stderr
    assert "AURORA_MISSION_CONFIG" in result.stderr
    assert not marker.exists()
    assert not (root / ".local-demo.lock").exists()
    assert (reports / "sentinel").read_text() == "original evidence"
    assert list(reports.iterdir()) == [reports / "sentinel"]
    assert not list(reports.parent.glob(scope + "-previous-*"))
    assert not Path(env["NPM_CALLED"]).exists()


@pytest.mark.parametrize("kind,launcher,scope", WRAPPERS)
@pytest.mark.parametrize("mission_override", [None, "", "custom"])
def test_shared_fixture_and_supported_mission_override_reach_takeoff(
    tmp_path, kind, launcher, scope, mission_override
):
    root, script, env = fixture(tmp_path, kind, launcher)
    # Exercise the real ASI Global shell defaults, then capture at the Take-Off
    # boundary instead of running contracts. This is configuration evidence only.
    global_script = Path("demo/asi-global/bin/asi-global-local.sh")
    (root / global_script).parent.mkdir(parents=True)
    shutil.copyfile(ROOT / global_script, root / global_script)
    npm = tmp_path / "bin/npm"
    npm.write_text(
        "#!/bin/sh\n"
        '[ "$1" = run ] && [ "$2" = demo:asi-global:local ] || exit 96\n'
        'exec bash "$PWD/demo/asi-global/bin/asi-global-local.sh"\n'
    )
    takeoff = root / "demo/asi-takeoff/bin/asi-takeoff-local.sh"
    takeoff.parent.mkdir(parents=True)
    takeoff.write_text(
        "#!/bin/sh\n"
        'printf "%s\\n" "$AURORA_MISSION_CONFIG" "$AURORA_REPORT_SCOPE" '
        '"$AURORA_REPORT_TITLE" "${ASI_GLOBAL_PLAN_PATH+set}" > "$MISSION_CAPTURE"\n'
    )
    capture = tmp_path / "mission-capture"
    env.update(NETWORK="localhost", MISSION_CAPTURE=str(capture))
    default = "demo/asi-global/config/mission@v2.json"
    expected = default
    if mission_override == "custom":
        custom = tmp_path / "reviewed mission.json"
        shutil.copyfile(ROOT / default, custom)
        expected = str(custom)
        env["AURORA_MISSION_CONFIG"] = expected
    elif mission_override is not None:
        env["AURORA_MISSION_CONFIG"] = mission_override
    result = subprocess.run(
        ["bash", str(script)], env=env, capture_output=True, text=True, timeout=5
    )
    assert result.returncode == 0, result.stderr
    mission, report_scope, title, plan_setting = capture.read_text().splitlines()
    assert mission == expected
    assert report_scope == scope
    assert "Contract-Lifecycle Fixture Report" in title
    assert plan_setting == ""
    assert f"Contract-lifecycle fixture: {expected}" in result.stderr
    assert "project-plan.json is design context; it is not executed" in result.stderr


@pytest.mark.parametrize("kind,launcher,scope", WRAPPERS)
def test_invalid_network_and_arguments_stop_before_reports(
    tmp_path, kind, launcher, scope
):
    root, script, env = fixture(tmp_path, kind, launcher)
    for network, args in [
        ("mainnet", []),
        ("../../outside", []),
        ("/", []),
        ("", []),
        ("local\nhost", []),
        ("--help", []),
        ("localhost", ["--execute"]),
    ]:
        result = subprocess.run(
            ["bash", str(script), *args],
            env={**env, "NETWORK": network},
            capture_output=True,
            text=True,
            timeout=5,
        )
        assert result.returncode == 1 and "requires NETWORK=localhost" in result.stderr
        assert not (root / "reports").exists()
        assert not Path(env["NPM_CALLED"]).exists()


@pytest.mark.parametrize("kind,launcher,scope", WRAPPERS)
def test_existing_evidence_is_archived_and_local_configuration_retained(
    tmp_path, kind, launcher, scope
):
    root, script, env = fixture(tmp_path, kind, launcher)
    reports = root / "reports/localhost" / scope
    reports.mkdir(parents=True)
    (reports / "sentinel").write_text("original evidence")
    result = subprocess.run(
        ["bash", str(script)],
        env={**env, "NETWORK": "localhost"},
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0, result.stderr
    archives = list(reports.parent.glob(scope + "-previous-*/reports/sentinel"))
    assert len(archives) == 1 and archives[0].read_text() == "original evidence"
    assert reports.is_dir() and list(reports.iterdir()) == []
    assert Path(env["NPM_CALLED"]).read_text().strip() == "localhost"


@pytest.mark.parametrize("kind,launcher,scope", WRAPPERS)
@pytest.mark.parametrize("level", ["reports", "localhost", "scope"])
def test_report_symlink_refused_without_touching_target(
    tmp_path, kind, launcher, scope, level
):
    root, script, env = fixture(tmp_path, kind, launcher)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "sentinel").write_text("keep")
    alias = root / "reports"
    if level != "reports":
        alias.mkdir()
        alias = alias / "localhost"
    if level == "scope":
        alias.mkdir()
        alias = alias / scope
    alias.symlink_to(outside, target_is_directory=True)
    result = subprocess.run(
        ["bash", str(script)],
        env={**env, "NETWORK": "localhost"},
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode != 0 and "real directories" in result.stderr
    assert (outside / "sentinel").read_text() == "keep"
    assert not Path(env["NPM_CALLED"]).exists()


@pytest.mark.parametrize("kind,launcher,scope", WRAPPERS)
def test_concurrent_launch_rejected_before_archival(tmp_path, kind, launcher, scope):
    import sys
    import time

    root, script, env = fixture(tmp_path, kind, launcher)
    reports = root / "reports/localhost" / scope
    reports.mkdir(parents=True)
    (reports / "sentinel").write_text("original evidence")
    env["NETWORK"] = "localhost"
    ready = tmp_path / "lock-ready"
    holder = subprocess.Popen(
        [
            sys.executable,
            str(root / "demo/aurora/bin/local-demo-lock.py"),
            "bash",
            "-c",
            'touch "$1"; sleep 30',
            "holder",
            str(ready),
        ],
        env=env,
        start_new_session=True,
    )
    try:
        deadline = time.monotonic() + 5
        while not ready.exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        assert ready.exists()
        result = subprocess.run(
            ["bash", str(script)], env=env, capture_output=True, text=True, timeout=5
        )
        assert (
            result.returncode != 0 and "Another supported local demo" in result.stderr
        )
        assert (reports / "sentinel").read_text() == "original evidence"
        assert not list(reports.parent.glob(scope + "-previous-*"))
        assert not Path(env["NPM_CALLED"]).exists()
    finally:
        import signal

        os.killpg(holder.pid, signal.SIGTERM)
        holder.wait(timeout=5)
