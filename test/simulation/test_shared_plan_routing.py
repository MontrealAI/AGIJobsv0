"""Inert copies of launchers; real npm, compiler, RPC and provider work are forbidden."""

import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE = "demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY"
SCOPE = "reports/localhost/omnigenesis-global-symphony"


def fixture(tmp_path):
    root = tmp_path / "checkout with spaces"
    for relative in [
        f"{MODULE}/bin/omnigenesis-ci.sh",
        f"{MODULE}/project-plan.json",
        f"{MODULE}/Makefile",
        "demo/asi-takeoff/scripts/plan.cjs",
        *[f"demo/aurora/bin/{name}" for name in (
            "local-node.sh", "local-demo-lock.py", "prepare-local-reports.cjs"
        )],
    ]:
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    bins = tmp_path / "bin"
    bins.mkdir()
    npm = bins / "npm"
    npm.write_text(
        f"#!{sys.executable}\n"
        "import json, os, pathlib, subprocess, sys\n"
        "e = os.environ\n"
        "subprocess.run([sys.executable, 'demo/aurora/bin/local-demo-lock.py', '--verify', 'true'], check=True)\n"
        "assert sys.argv[1:3] in [['run', 'demo:asi-takeoff'], ['run', 'demo:asi-takeoff:kit']]\n"
        "keys = ['ASI_TAKEOFF_PLAN_PATH', 'ASI_TAKEOFF_REPORT_ROOT', 'HARDHAT_NETWORK', 'AGIJOBS_FLAGSHIP_SKIP_ONCHAIN']\n"
        "with open(e['COMMAND_LOG'], 'a') as log: log.write(json.dumps({'argv':sys.argv[1:], 'cwd':os.getcwd(), 'env':{k:e.get(k) for k in keys}})+'\\n')\n"
        "target = pathlib.Path(e['ASI_TAKEOFF_REPORT_ROOT'])\n"
        "(target / '.inert-partial').write_text(e['RUN_LABEL'])\n"
        "if sys.argv[2] == e.get('FAIL_STEP'): sys.exit(43)\n"
    )
    npm.chmod(0o700)
    for name in ("npx", "anvil", "hardhat", "git", "rsync", "rm"):
        guard = bins / name
        guard.write_text('#!/bin/sh\necho "Forbidden fixture command: $0" >&2\nexit 97\n')
        guard.chmod(0o700)
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("ASI_", "AURORA_", "AGI", "DEMO_", "OMNIGENESIS_", "HARDHAT_"))
           and key != "NETWORK"}
    env.update(PATH=str(bins) + os.pathsep + os.environ["PATH"],
               COMMAND_LOG=str(tmp_path / "commands.jsonl"), RUN_LABEL="first")
    return root, root / f"{MODULE}/bin/omnigenesis-ci.sh", root / SCOPE, env


def run(script, env, *args):
    return subprocess.run(["bash", str(script), *args], cwd=script.parents[4],
                          env=env, text=True, capture_output=True, timeout=15)


def records(env):
    log = Path(env["COMMAND_LOG"])
    return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []


def seed(target):
    target.mkdir(parents=True)
    (target / "sentinel").write_bytes(b"original\x00evidence\n")
    (target / ".hidden").write_text("hidden original")


def original(target):
    assert (target / "sentinel").read_bytes() == b"original\x00evidence\n"
    assert (target / ".hidden").read_text() == "hidden original"


@pytest.mark.parametrize("args", [[], ["--help"], ["-h"], ["--plan"]])
def test_default_help_and_plan_are_effect_free(tmp_path, args):
    root, script, target, env = fixture(tmp_path)
    seed(target)
    result = run(script, env, *args)
    assert result.returncode == 0, result.stderr
    assert "planning-only" in result.stdout if args == ["--plan"] else "Usage:" in result.stdout
    original(target)
    assert not (root / ".local-demo.lock").exists()
    assert not list(target.parent.glob(target.name + "-previous-*"))
    assert not records(env)


@pytest.mark.parametrize("target", [None, "help", "plan", "preview"])
def test_make_default_and_inspection_targets_are_inert(tmp_path, target):
    root, script, reports, env = fixture(tmp_path)
    seed(reports)
    result = subprocess.run(["make", "-C", str(root / MODULE), *([target] if target else [])],
                            env=env, text=True, capture_output=True, timeout=15)
    assert result.returncode == 0, result.stderr
    original(reports)
    assert not records(env)
    assert not (root / ".local-demo.lock").exists()


@pytest.mark.parametrize("args", [["legacy-plan.json"], ["--execute"], ["--help", "extra"],
                                  ["--plan", "one", "two"], ["--rehearse", "a", "b", "c"]])
def test_invalid_arguments_fail_without_effects(tmp_path, args):
    root, script, target, env = fixture(tmp_path)
    seed(target)
    result = run(script, env, *args)
    assert result.returncode != 0
    original(target)
    assert not records(env)
    assert not (root / ".local-demo.lock").exists()


@pytest.mark.parametrize("plan_kind", ["default", "relative", "absolute", "environment"])
def test_rehearsal_binds_selected_plan_and_report_root_to_both_consumers(tmp_path, plan_kind):
    root, script, target, env = fixture(tmp_path)
    selected = root / MODULE / "project-plan.json"
    args = ["--rehearse"]
    if plan_kind != "default":
        custom = root / "scenario with spaces.json"
        custom.write_bytes(selected.read_bytes())
        selected = custom
        if plan_kind == "environment":
            env["ASI_TAKEOFF_PLAN_PATH"] = custom.name
        else:
            args += [custom.name if plan_kind == "relative" else str(custom)]
    result = run(script, env, *args)
    assert result.returncode == 0, result.stderr
    first, kit = records(env)
    assert first["argv"] == ["run", "demo:asi-takeoff"]
    for call in (first, kit):
        assert call["cwd"] == str(root)
        assert call["env"]["ASI_TAKEOFF_PLAN_PATH"] == str(selected)
        assert call["env"]["ASI_TAKEOFF_REPORT_ROOT"] == str(target)
        assert call["env"]["HARDHAT_NETWORK"] == "hardhat"
    assert kit["argv"] == ["run", "demo:asi-takeoff:kit", "--", "--plan", str(selected),
                           "--report-root", str(target), "--summary-md", str(target / "summary.md"),
                           "--bundle", str(target / "mission-bundle"), "--logs", str(target / "logs"),
                           "--network", "hardhat"]
    assert "report context only" in result.stderr
    assert not (root / "reports/asi-takeoff").exists()


@pytest.mark.parametrize("step", [None, "demo:asi-takeoff", "demo:asi-takeoff:kit"])
def test_repeat_and_failed_runs_preserve_full_previous_evidence(tmp_path, step):
    root, script, target, env = fixture(tmp_path)
    seed(target)
    if step:
        env["FAIL_STEP"] = step
    first = run(script, env, "--rehearse")
    assert first.returncode == (43 if step else 0), first.stderr
    archives = list(target.parent.glob(target.name + "-previous-*/reports"))
    assert len(archives) == 1
    original(archives[0])
    assert (target / ".inert-partial").read_text() == "first"
    second = run(script, {**env, "RUN_LABEL": "second"}, "--rehearse")
    assert second.returncode == (43 if step else 0), second.stderr
    archives = list(target.parent.glob(target.name + "-previous-*/reports"))
    assert len(archives) == 2
    assert len([p for p in archives if (p / ".inert-partial").exists()]) == 1
    assert (target / ".inert-partial").read_text() == "second"
    if step == "demo:asi-takeoff":
        assert all(call["argv"][1] == step for call in records(env))


@pytest.mark.parametrize("key,value", [
    ("NETWORK", "mainnet"), ("NETWORK", ""), ("HARDHAT_NETWORK", "localhost"),
    ("AURORA_REPORT_SCOPE", "other"), ("ASI_TAKEOFF_REPORT_ROOT", ""),
    ("ASI_TAKEOFF_REPORT_ROOT", "reports/other"), ("OMNIGENESIS_REPORT_ROOT", "../../outside"),
    ("AGIJOBS_FLAGSHIP_SKIP_ONCHAIN", "TRUE"),
])
def test_conflicting_environment_fails_before_locks_or_archives(tmp_path, key, value):
    root, script, target, env = fixture(tmp_path)
    seed(target)
    result = run(script, {**env, key: value}, "--rehearse")
    assert result.returncode != 0
    original(target)
    assert not records(env)
    assert not (root / ".local-demo.lock").exists()


@pytest.mark.parametrize("contents", [None, "{", "{}"])
def test_missing_or_invalid_plan_fails_before_locks_or_archives(tmp_path, contents):
    root, script, target, env = fixture(tmp_path)
    seed(target)
    plan = root / "invalid.json"
    if contents is not None:
        plan.write_text(contents)
    result = run(script, env, "--rehearse", str(plan))
    assert result.returncode != 0
    original(target)
    assert not records(env)
    assert not (root / ".local-demo.lock").exists()


def test_plan_inside_report_scope_is_not_archived_out_from_under_consumer(tmp_path):
    root, script, target, env = fixture(tmp_path)
    seed(target)
    plan = target / "context.json"
    shutil.copyfile(root / MODULE / "project-plan.json", plan)
    result = run(script, env, "--rehearse", str(plan))
    assert result.returncode != 0
    assert "outside the report scope" in result.stderr
    original(target)
    assert not records(env)
    assert not (root / ".local-demo.lock").exists()


@pytest.mark.parametrize("report", ["/", "../outside", "reports/other", ""])
def test_unrecognized_output_paths_are_rejected(tmp_path, report):
    root, script, target, env = fixture(tmp_path)
    seed(target)
    result = run(script, env, "--rehearse", str(root / MODULE / "project-plan.json"), report)
    assert result.returncode != 0
    original(target)
    assert not records(env)
    assert not (root / ".local-demo.lock").exists()


@pytest.mark.parametrize("component", ["reports", "reports/localhost", SCOPE])
@pytest.mark.parametrize("kind", ["symlink", "file"])
def test_unsafe_report_components_preserve_evidence_and_do_not_execute(tmp_path, component, kind):
    root, script, target, env = fixture(tmp_path)
    outside = tmp_path / "outside"
    seed(outside)
    unsafe = root / component
    unsafe.parent.mkdir(parents=True, exist_ok=True)
    if kind == "symlink":
        unsafe.symlink_to(outside, target_is_directory=True)
    else:
        unsafe.write_text("keep original file")
    result = run(script, env, "--rehearse")
    assert result.returncode != 0
    assert "real directories" in result.stderr
    original(outside)
    assert not records(env)
    if kind == "file":
        assert unsafe.read_text() == "keep original file"


def test_busy_lock_prevents_archival_and_downstream_work(tmp_path):
    root, script, target, env = fixture(tmp_path)
    seed(target)
    with (root / ".local-demo.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = run(script, env, "--rehearse")
    assert result.returncode != 0
    assert "Another supported local demo" in result.stderr
    original(target)
    assert not list(target.parent.glob(target.name + "-previous-*"))
    assert not records(env)


@pytest.mark.parametrize("plan", [None, "", "preserve this first-stage plan.json"])
def test_local_runner_warns_without_mutating_plan_or_mission_config(tmp_path, plan):
    root = tmp_path / "boundary fixture"
    script = root / "demo/asi-takeoff/bin/asi-takeoff-local.sh"
    script.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / "demo/asi-takeoff/bin/asi-takeoff-local.sh", script)
    helper = root / "demo/aurora/bin/local-node.sh"
    helper.parent.mkdir(parents=True)
    # Stop at the existing lock boundary, before ANY local-runner work.
    helper.write_text('lock_local_demo() { printf "plan=%s\\nmission=%s\\n" "${ASI_TAKEOFF_PLAN_PATH-UNSET}" "$AURORA_MISSION_CONFIG"; exit 73; }\n')
    env = {key: value for key, value in os.environ.items() if key != "ASI_TAKEOFF_PLAN_PATH"}
    env["AURORA_MISSION_CONFIG"] = "preserve/custom mission.json"
    if plan is not None:
        env["ASI_TAKEOFF_PLAN_PATH"] = plan
    result = subprocess.run(["bash", str(script)], env=env, text=True, capture_output=True, timeout=5)
    assert result.returncode == 73
    assert result.stdout == f"plan={plan if plan is not None else 'UNSET'}\nmission=preserve/custom mission.json\n"
    if plan is None:
        assert result.stderr == ""
    else:
        assert "WARNING:" in result.stderr
        assert "ignores ASI_TAKEOFF_PLAN_PATH" in result.stderr
        assert "supplied scenario jobs are not executed" in result.stderr
    assert not (root / "reports").exists()


@pytest.mark.parametrize("report_kind", ["relative", "absolute", "environment"])
def test_documented_report_target_and_offline_intent_are_retained(tmp_path, report_kind):
    root, script, target, env = fixture(tmp_path)
    env.update(NETWORK="localhost", HARDHAT_NETWORK="hardhat",
               AURORA_REPORT_SCOPE="omnigenesis-global-symphony",
               AGIJOBS_FLAGSHIP_SKIP_ONCHAIN="true")
    args = ["--rehearse"]
    if report_kind == "environment":
        env["OMNIGENESIS_REPORT_ROOT"] = SCOPE
    else:
        args += [str(root / MODULE / "project-plan.json"),
                 SCOPE if report_kind == "relative" else str(target)]
    result = run(script, env, *args)
    assert result.returncode == 0, result.stderr
    assert len(records(env)) == 2
    assert all(call["env"]["AGIJOBS_FLAGSHIP_SKIP_ONCHAIN"] == "true" for call in records(env))


def test_omnigenesis_is_not_added_as_an_unrelated_kit_archive_target(tmp_path):
    root, script, target, env = fixture(tmp_path)
    result = subprocess.run(["node", str(root / "demo/aurora/bin/prepare-local-reports.cjs"),
                             "--kit", "omnigenesis-global-symphony"], env=env,
                            text=True, capture_output=True, timeout=5)
    assert result.returncode == 1
    assert "Unknown report scope or mode" in result.stderr
    assert not (root / "reports").exists()


def test_make_ci_explicitly_selects_rehearsal(tmp_path):
    root, script, target, env = fixture(tmp_path)
    result = subprocess.run(["make", "-C", str(root / MODULE), "ci"],
                            env=env, text=True, capture_output=True, timeout=15)
    assert result.returncode == 0, result.stderr
    assert [call["argv"][1] for call in records(env)] == ["demo:asi-takeoff", "demo:asi-takeoff:kit"]
