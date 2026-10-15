"""Inert command fixtures: never invoke a deployment, RPC or package manager."""

import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "demo/omni-orchestrator-singularity/bin/orchestrate.sh"


@pytest.mark.parametrize(
    "args,code",
    [
        ([], 2),
        (["--network"], 2),
        (["--mode"], 2),
        (["--network", ""], 2),
        (["--network", "mainnet"], 2),
        (["--network", "https://example.invalid"], 2),
        (["--network", "localhost", "--mode", "typo"], 2),
        (["--network", "localhost", "--mode", ""], 2),
        (["--network", "localhost", "--mode", "dry-run", "--mode", "execute"], 2),
        (["--network", "localhost", "--network", "localhost"], 2),
        (["--network", "localhost", "--unknown"], 2),
        (["--help", "--mode", "execute"], 2),
        (["--network", "localhost"], 0),
        (["--network", "localhost", "--mode", "dry-run"], 0),
        (["--help"], 0),
    ],
)
def test_no_side_effects(tmp_path, args, code):
    marker = tmp_path / "called"
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for command in ["git", "mkdir", "npx", "npm", "cp", "tee"]:
        stub = bin_dir / command
        stub.write_text(f'#!/bin/sh\necho {command} >> "{marker}"\nexit 91\n')
        stub.chmod(0o755)
    result = subprocess.run(
        ["/bin/bash", str(SCRIPT), *args],
        cwd=tmp_path,
        env={**os.environ, "PATH": f"{bin_dir}:/usr/bin:/bin"},
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == code, result.stderr
    assert not marker.exists()
    assert not (tmp_path / "reports").exists()


@pytest.mark.parametrize("flag", ["--dry-run", "--dry-run=true", "--dry-run=false"])
def test_direct_stack_rejects_dry_run_before_spawn(tmp_path, flag):
    marker = tmp_path / "called"
    npm = tmp_path / "npm"
    npm.write_text(f'#!/bin/sh\necho called > "{marker}"\nexit 91\n')
    npm.chmod(0o755)
    result = subprocess.run(
        [
            "node",
            str(ROOT / "node_modules/ts-node/dist/bin.js"),
            "--transpile-only",
            "--compiler-options",
            '{"module":"commonjs"}',
            str(ROOT / "scripts/v2/oneclick-stack.ts"),
            flag,
            "--network",
            "localhost",
        ],
        cwd=ROOT,
        env={**os.environ, "PATH": f"{tmp_path}:" + os.environ["PATH"]},
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 1
    assert "--dry-run is unsupported" in result.stderr
    assert not marker.exists()


def test_explicit_operational_stack_forwarding_uses_only_stub(tmp_path):
    marker = tmp_path / "args"
    npm = tmp_path / "npm"
    npm.write_text(f'#!/bin/sh\nprintf "%s\\n" "$@" > "{marker}"\nexit 0\n')
    npm.chmod(0o755)
    result = subprocess.run(
        [
            "node",
            str(ROOT / "node_modules/ts-node/dist/bin.js"),
            "--transpile-only",
            "--compiler-options",
            '{"module":"commonjs"}',
            str(ROOT / "scripts/v2/oneclick-stack.ts"),
            "--network",
            "localhost",
            "--no-compose",
        ],
        cwd=ROOT,
        env={**os.environ, "PATH": f"{tmp_path}:" + os.environ["PATH"]},
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    assert marker.read_text().splitlines() == [
        "run",
        "deploy:oneclick:wizard",
        "--",
        "--yes",
        "--no-compose",
        "--network",
        "localhost",
    ]
