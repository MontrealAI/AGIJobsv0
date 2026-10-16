"""Private launcher fixtures: no real npm, RPC, deployment, or provider execution."""

import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
ZENITH = [
    ("global-governance", "zenith-sapience"),
    ("celestial-archon-governance", "zenith-celestial-archon"),
    ("omnidominion-governance", "zenith-omnidominion"),
    ("planetary-operating-system-governance", "zenith-planetary-os"),
]
LAUNCHERS = [
    (
        f"demo/zenith-sapience-initiative-{kind}/bin/{scope}.sh",
        f"reports/{scope}",
        f"demo/zenith-sapience-initiative-{kind}/project-plan.json",
    )
    for kind, scope in ZENITH
] + [
    (
        "demo/infinity-symphony/bin/infinity-symphony-local.sh",
        "reports/localhost/infinity-symphony",
        "demo/infinity-symphony/project-plan.json",
    )
]
INFINITY = LAUNCHERS[-1]
BAD_VALUES = ["mainnet", "/", "/tmp/outside", "../../outside", "", "local\nhost", "--help"]


def fixture(tmp_path, launcher):
    relative, report_path, plan_path = launcher
    root = tmp_path / "repo with spaces"
    script = root / relative
    script.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / relative, script)
    helper = root / "demo/aurora/bin"
    helper.mkdir(parents=True)
    for name in ("local-node.sh", "local-demo-lock.py", "prepare-local-reports.cjs"):
        shutil.copyfile(ROOT / "demo/aurora/bin" / name, helper / name)
    plan = root / plan_path
    plan.parent.mkdir(parents=True, exist_ok=True)
    plan.write_text('{"fixture":true}\n')
    bins = tmp_path / "bin"
    bins.mkdir()
    # Capture argv as an array, rather than losing boundaries in "$*".
    npm = bins / "npm"
    npm.write_text(
        f"#!{sys.executable}\n"
        "import json, os, pathlib, subprocess, sys\n"
        "e = os.environ\n"
        "keys = ['NETWORK', 'AURORA_REPORT_SCOPE', 'ASI_TAKEOFF_PLAN_PATH', "
        "'ASI_TAKEOFF_REPORT_ROOT', 'ASI_GLOBAL_PLAN_PATH', 'ASI_GLOBAL_REPORT_ROOT']\n"
        "entry = {'cwd': os.getcwd(), 'argv': sys.argv[1:], "
        "'env': {k:e.get(k) for k in keys}}\n"
        "with open(e['COMMAND_LOG'], 'a') as log: log.write(json.dumps(entry)+'\\n')\n"
        # This npm substitute closes inherited FDs like real npm can. Validate
        # that the live wrapper ancestor still owns the existing safety locks.
        "subprocess.run([sys.executable, 'demo/aurora/bin/local-demo-lock.py', "
        "'--verify', 'true'], check=True)\n"
        "target = pathlib.Path(e.get('ASI_TAKEOFF_REPORT_ROOT') "
        "or e['ASI_GLOBAL_REPORT_ROOT'])\n"
        "target.mkdir(parents=True, exist_ok=True)\n"
        "(target / 'partial.json').write_text(json.dumps({'run': e['RUN_LABEL']}))\n"
        "(target / '.hidden-evidence').write_text(e['RUN_LABEL'])\n"
        "if sys.argv[2] == 'demo:asi-takeoff':\n"
        "    (target / 'artifact with spaces.json').write_text('{}\\n')\n"
        "if sys.argv[2] == e.get('FAIL_STEP'): sys.exit(43)\n"
    )
    npm.chmod(0o700)
    # Regressions must not escape the fixture to any operational command.
    for name in ("npx", "anvil", "hardhat", "git", "rsync", "rm"):
        stub = bins / name
        stub.write_text('#!/bin/sh\necho "Forbidden fixture command: $0" >&2\nexit 97\n')
        stub.chmod(0o700)
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("ASI_", "AURORA_", "AGI_LOCAL_", "DEMO_"))
        and key != "NETWORK"
    }
    env.update(
        PATH=str(bins) + os.pathsep + os.environ["PATH"],
        COMMAND_LOG=str(tmp_path / "commands.jsonl"),
        RUN_LABEL="first",
    )
    return root, script, root / report_path, env


def run(script, env, *args):
    return subprocess.run(
        ["bash", str(script), *args],
        cwd=script.parents[4],  # deliberately outside the fixture checkout
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )


def records(env):
    return [json.loads(line) for line in Path(env["COMMAND_LOG"]).read_text().splitlines()]


def seed(target):
    target.mkdir(parents=True)
    (target / "sentinel").write_bytes(b"original evidence\x00\n")
    (target / ".hidden-sentinel").write_text("hidden original")


def assert_original(target):
    assert (target / "sentinel").read_bytes() == b"original evidence\x00\n"
    assert (target / ".hidden-sentinel").read_text() == "hidden original"


@pytest.mark.parametrize("field", ["NETWORK", "AURORA_REPORT_SCOPE"])
@pytest.mark.parametrize("value", BAD_VALUES + ["zenith-sapience", "infinity-symphony/child"])
def test_infinity_rejects_unsafe_network_and_scope_before_any_effect(tmp_path, field, value):
    root, script, target, env = fixture(tmp_path, INFINITY)
    seed(target)
    env[field] = value
    for command in ("python3", "node", "npm"):
        stub = tmp_path / "bin" / command
        stub.write_text('#!/bin/sh\ntouch "$EARLY_CALL"\nexit 97\n')
        stub.chmod(0o700)
    env["EARLY_CALL"] = str(tmp_path / "early-call")
    result = run(script, env)
    assert result.returncode == 1
    assert "requires NETWORK=localhost" in result.stderr
    assert_original(target)
    assert not list(target.parent.glob(target.name + "-previous-*"))
    assert not (root / ".local-demo.lock").exists()
    assert not Path(env["EARLY_CALL"]).exists()


@pytest.mark.parametrize("args", [["--unknown"], ["--ci", "extra"], ["--ci", "--ci"], [""]])
def test_infinity_rejects_unsupported_options_before_effects(tmp_path, args):
    root, script, target, env = fixture(tmp_path, INFINITY)
    result = run(script, env, *args)
    assert result.returncode == 1
    assert "only the optional --ci" in result.stderr
    assert not target.exists()
    assert not (root / ".local-demo.lock").exists()
    assert not Path(env["COMMAND_LOG"]).exists()


@pytest.mark.parametrize("override", ["", "reports/asi-takeoff", "/tmp/elsewhere", "../outside"])
def test_infinity_rejects_configured_report_root_without_silently_ignoring_it(tmp_path, override):
    root, script, target, env = fixture(tmp_path, INFINITY)
    seed(target)
    result = run(script, {**env, "ASI_TAKEOFF_REPORT_ROOT": override})
    assert result.returncode == 1
    assert "ASI_TAKEOFF_REPORT_ROOT overrides are unsupported" in result.stderr
    assert_original(target)
    assert not (root / ".local-demo.lock").exists()
    assert not Path(env["COMMAND_LOG"]).exists()


@pytest.mark.parametrize("launcher", LAUNCHERS)
@pytest.mark.parametrize("bad_type", ["symlink", "dangling", "file"])
@pytest.mark.parametrize("level", ["reports", "parent", "target"])
def test_non_directory_report_components_fail_closed(tmp_path, launcher, bad_type, level):
    root, script, target, env = fixture(tmp_path, launcher)
    outside = tmp_path / "outside"
    seed(outside)
    alias = {"reports": root / "reports", "parent": target.parent, "target": target}[level]
    alias.parent.mkdir(parents=True, exist_ok=True)
    if bad_type == "file":
        alias.write_text("keep this file")
    else:
        alias.symlink_to(outside if bad_type == "symlink" else tmp_path / "absent", target_is_directory=True)
    result = run(script, env)
    assert result.returncode != 0
    assert "real directories" in result.stderr
    assert_original(outside)
    assert not Path(env["COMMAND_LOG"]).exists()
    if bad_type == "file":
        assert alias.read_text() == "keep this file"
    else:
        assert alias.is_symlink()


@pytest.mark.parametrize("launcher", LAUNCHERS)
def test_repeat_runs_archive_exact_scope_and_keep_partial_failure_evidence(tmp_path, launcher):
    root, script, target, env = fixture(tmp_path, launcher)
    seed(target)
    sibling = target.parent / "unrelated-evidence"
    seed(sibling)
    shared_takeoff = root / "reports/asi-takeoff"
    seed(shared_takeoff)
    for index, label in enumerate(["first", "second", "failed"], 1):
        failure = "demo:asi-takeoff" if launcher == INFINITY else "demo:asi-global"
        current = {**env, "RUN_LABEL": label}
        if label == "failed":
            current["FAIL_STEP"] = failure
        result = run(script, current)
        assert result.returncode == (43 if label == "failed" else 0), result.stderr
        archives = sorted(target.parent.glob(target.name + "-previous-*/reports"))
        assert len(archives) == index
        original = [archive for archive in archives if (archive / "sentinel").exists()]
        assert len(original) == 1
        assert_original(original[0])
        partial = target / "dry-run" if launcher == INFINITY else target
        assert json.loads((partial / "partial.json").read_text()) == {"run": label}
        assert (partial / ".hidden-evidence").read_text() == label
        assert_original(sibling)
        assert_original(shared_takeoff)
    previous_labels = []
    for archive in archives:
        partial = archive / "dry-run" if launcher == INFINITY else archive
        if (partial / "partial.json").exists():
            previous_labels.append(json.loads((partial / "partial.json").read_text())["run"])
    assert sorted(previous_labels) == ["first", "second"]


@pytest.mark.parametrize("step", ["demo:asi-takeoff:kit", "demo:aurora:report", "owner:parameters", "owner:verify-control"])
def test_infinity_later_failure_keeps_old_and_partial_evidence(tmp_path, step):
    root, script, target, env = fixture(tmp_path, INFINITY)
    seed(target)
    result = run(script, {**env, "FAIL_STEP": step}, "--ci")
    assert result.returncode == 43, result.stderr
    archive, = target.parent.glob(target.name + "-previous-*/reports")
    assert_original(archive)
    assert (target / "dry-run/partial.json").is_file()
    assert records(env)[-1]["argv"][1] == step
    assert "Infinity Symphony completed" not in result.stdout


@pytest.mark.parametrize("launcher", LAUNCHERS)
def test_repository_lock_contention_rejects_before_archival(tmp_path, launcher):
    root, script, target, env = fixture(tmp_path, launcher)
    seed(target)
    with (root / ".local-demo.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = run(script, env)
    assert result.returncode != 0
    assert "Another supported local demo" in result.stderr
    assert_original(target)
    assert not list(target.parent.glob(target.name + "-previous-*"))
    assert not Path(env["COMMAND_LOG"]).exists()


@pytest.mark.parametrize("launcher", LAUNCHERS[:-1])
def test_nonlocal_zenith_retains_real_plan_and_argv_boundaries(tmp_path, launcher):
    root, script, target, env = fixture(tmp_path, launcher)
    args = ["--report", "space separated", "", "--", "literal\nvalue", "*.json"]
    result = run(script, {**env, "ASI_GLOBAL_PLAN_PATH": "ignored-old-override"}, *args)
    assert result.returncode == 0, result.stderr
    record, = records(env)
    assert record["cwd"] == str(root)
    assert record["argv"] == ["run", "demo:asi-global", "--", *args]
    assert record["env"]["ASI_GLOBAL_PLAN_PATH"] == launcher[2]
    assert record["env"]["ASI_GLOBAL_REPORT_ROOT"] == launcher[1]


@pytest.mark.parametrize("plan_kind", ["default", "relative", "absolute"])
@pytest.mark.parametrize("ci_mode", [False, True])
def test_infinity_binds_real_plan_and_isolated_outputs_to_both_consumers(tmp_path, plan_kind, ci_mode):
    root, script, target, env = fixture(tmp_path, INFINITY)
    plan = root / INFINITY[2]
    if plan_kind != "default":
        plan = root / "reviewed plan with spaces.json"
        plan.write_text('{"reviewed":true}')
        env["ASI_TAKEOFF_PLAN_PATH"] = plan.name if plan_kind == "relative" else str(plan)
    env.update(NETWORK="localhost", AURORA_REPORT_SCOPE="infinity-symphony")
    result = run(script, env, *(["--ci"] if ci_mode else []))
    assert result.returncode == 0, result.stderr
    calls = records(env)
    assert [call["argv"][1] for call in calls] == [
        "demo:asi-takeoff", "demo:asi-takeoff:kit", "demo:aurora:report",
        "owner:atlas", "owner:command-center", "owner:mission-control",
        "owner:diagram", "owner:parameters", "thermodynamics:report",
    ] + (["owner:verify-control"] if ci_mode else [])
    for call in calls:
        assert call["cwd"] == str(root)
        assert call["env"]["ASI_TAKEOFF_PLAN_PATH"] == str(plan)
        assert call["env"]["ASI_TAKEOFF_REPORT_ROOT"] == str(target / "dry-run")
    kit = calls[1]["argv"]
    assert kit[kit.index("--plan") + 1] == str(plan)
    assert kit[kit.index("--report-root") + 1] == str(target / "dry-run")
    assert not (root / "reports/asi-takeoff").exists()
    assert (target / "receipts/.hidden-evidence").read_text() == "first"
    digest = target / "receipts/SHA256SUMS"
    if shutil.which("shasum"):
        assert "SHA256SUMS" not in digest.read_text()
        subprocess.run(["shasum", "-a", "256", "-c", "SHA256SUMS"], cwd=digest.parent, check=True, capture_output=True)


def test_infinity_missing_plan_fails_before_locks_and_archival(tmp_path):
    root, script, target, env = fixture(tmp_path, INFINITY)
    seed(target)
    result = run(script, {**env, "ASI_TAKEOFF_PLAN_PATH": "missing.json"})
    assert result.returncode == 1
    assert "must name an existing plan file" in result.stderr
    assert_original(target)
    assert not (root / ".local-demo.lock").exists()
    assert not Path(env["COMMAND_LOG"]).exists()


@pytest.mark.parametrize("args", [["--kit", "infinity-symphony"], ["--kit", "../zenith-sapience"], ["--kit", ""], ["--kit", "/tmp"], ["--kit"], ["extra", "zenith-sapience"], ["../infinity-symphony"]])
def test_archive_helper_rejects_every_nonallowlisted_target(tmp_path, args):
    root, script, target, env = fixture(tmp_path, INFINITY)
    result = subprocess.run(
        ["node", str(root / "demo/aurora/bin/prepare-local-reports.cjs"), *args],
        env=env, capture_output=True, text=True, timeout=5,
    )
    assert result.returncode == 1
    assert not (root / "reports").exists()


def test_launcher_regressions_are_mandatory_in_ci():
    workflow = (ROOT / ".github/workflows/ci.yml").read_text()
    python_job = workflow.split("  python_unit:\n", 1)[1].split("\n  python_", 1)[0]
    assert "python -m pytest --confcutdir=test/simulation test/simulation/test_report_archive_launchers.py" in python_job
    assert "continue-on-error" not in python_job
