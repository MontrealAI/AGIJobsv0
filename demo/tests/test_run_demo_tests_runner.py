from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Iterable

import pytest

from demo import run_demo_tests


def test_suite_runtime_root_uses_demo_and_relative_path(tmp_path: Path) -> None:
    demo_a = tmp_path / "demo-a"
    demo_b = tmp_path / "demo-b"
    for demo in (demo_a, demo_b):
        tests_dir = demo / "nested" / "tests"
        tests_dir.mkdir(parents=True)

    suite_a = run_demo_tests._suite_runtime_root(
        tmp_path, demo_a, demo_a / "nested" / "tests", runner="python"
    )
    suite_b = run_demo_tests._suite_runtime_root(
        tmp_path, demo_b, demo_b / "nested" / "tests", runner="npm"
    )

    assert suite_a != suite_b
    assert suite_a.relative_to(tmp_path) == Path("demo-a/nested/tests/python")
    assert suite_b.relative_to(tmp_path) == Path("demo-b/nested/tests/npm")


def test_main_respects_runtime_dir_option(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    test_file = tests_dir / "test_ok.py"
    test_file.write_text("def test_ok():\n    assert True\n")

    runtime_dir = tmp_path / "runtime"

    exit_code = run_demo_tests.main(["--runtime-dir", str(runtime_dir)], demo_root=demo_root)

    assert exit_code == 0
    sandbox = runtime_dir / "example" / "tests" / "python" / "orchestrator"
    assert sandbox.exists()
    assert (sandbox / "agents").exists()


def test_main_clears_existing_runtime_dir(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_ok.py").write_text("def test_ok():\n    assert True\n")

    runtime_dir = tmp_path / "runtime"
    stale_artifact = (
        runtime_dir / "example" / "tests" / "python" / "orchestrator" / "checkpoint.json"
    )
    stale_artifact.parent.mkdir(parents=True)
    stale_artifact.write_text("stale checkpoint")

    exit_code = run_demo_tests.main(["--runtime-dir", str(runtime_dir)], demo_root=demo_root)

    assert exit_code == 0
    assert not stale_artifact.exists()


def test_max_workers_option_validates_positive_values() -> None:
    args = run_demo_tests._parse_args(["--max-workers", "3"])
    assert args.max_workers == 3

    with pytest.raises(SystemExit):
        run_demo_tests._parse_args(["--max-workers", "0"])


def test_parallel_runs_use_multiple_threads(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_root = tmp_path / "demo"
    suites: list[run_demo_tests.Suite] = []
    for name in ("alpha", "beta"):
        demo_dir = demo_root / name
        tests_dir = demo_dir / "tests"
        tests_dir.mkdir(parents=True)
        suites.append(
            run_demo_tests.Suite(
                demo_root=demo_dir,
                tests_dir=tests_dir,
                runner="python",
            )
        )

    monkeypatch.setattr(
        run_demo_tests,
        "_discover_tests",
        lambda *_args, **_kwargs: suites,
    )

    threads: list[str] = []

    def fake_run_suite(
        suite: run_demo_tests.Suite,
        env_overrides: dict[str, str],
        *,
        allow_empty: bool = False,
        timeout: float | None = None,
        capture_output: bool = False,
    ) -> tuple[int, str | None]:
        threads.append(threading.current_thread().name)
        time.sleep(0.05)
        return 0, "captured" if capture_output else None

    monkeypatch.setattr(run_demo_tests, "_run_suite", fake_run_suite)

    exit_code = run_demo_tests.main(["--max-workers", "2"], demo_root=demo_root)

    assert exit_code == 0
    assert len(set(threads)) >= 2


def test_list_mode_does_not_create_runtime_artifacts(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_ok.py").write_text("def test_ok():\n    assert True\n")

    runtime_dir = tmp_path / "runtime"

    exit_code = run_demo_tests.main(
        ["--list", "--runtime-dir", str(runtime_dir)], demo_root=demo_root
    )

    assert exit_code == 0
    assert not runtime_dir.exists()


def test_top_level_tests_directory_is_discovered(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_ok.py").write_text("def test_ok():\n    assert True\n")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=tests_dir,
            tests_dir=tests_dir,
            runner="python",
        )
    ]


def test_include_filter_matches_relative_paths(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    alpha_tests = demo_root / "alpha" / "tests"
    beta_tests = demo_root / "beta" / "nested" / "tests"
    alpha_tests.mkdir(parents=True)
    beta_tests.mkdir(parents=True)
    (alpha_tests / "test_alpha.py").write_text("def test_alpha():\n    assert True\n")
    (beta_tests / "test_beta.py").write_text("def test_beta():\n    assert True\n")

    suites = list(
        run_demo_tests._discover_tests(
            demo_root, include={"beta/nested", "does-not-match"}
        )
    )

    assert suites == [
        run_demo_tests.Suite(
            demo_root=demo_root / "beta",
            tests_dir=beta_tests,
            runner="python",
        )
    ]


def test_demo_filter_normalizes_comma_separated_tokens() -> None:
    include = run_demo_tests._normalize_include_filters([
        " Alpha ,beta/nested ",
        " ,gamma",
    ])

    assert include == {"alpha", "beta/nested", "gamma"}


def test_demo_filter_returns_none_when_empty() -> None:
    assert run_demo_tests._normalize_include_filters([]) is None
    assert run_demo_tests._normalize_include_filters([" , "]) is None


def test_playwright_dep_check_requires_passwordless_sudo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run_demo_tests.sys, "platform", "linux")
    monkeypatch.setattr(run_demo_tests.os, "geteuid", lambda: 1000)

    def fake_which(name: str) -> str | None:
        return f"/usr/bin/{name}"

    monkeypatch.setattr(run_demo_tests.shutil, "which", fake_which)
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 1)

    monkeypatch.setattr(run_demo_tests.subprocess, "run", fake_run)

    assert run_demo_tests._can_install_playwright_deps() is False
    assert calls == [["/usr/bin/sudo", "-n", "true"]]


def test_playwright_dep_check_accepts_root(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run_demo_tests.sys, "platform", "linux")
    monkeypatch.setattr(run_demo_tests.os, "geteuid", lambda: 0)
    monkeypatch.setattr(run_demo_tests.shutil, "which", lambda name: f"/usr/bin/{name}")

    assert run_demo_tests._can_install_playwright_deps() is True


def test_playwright_dep_readiness_detects_installed_libs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    libs = [
        tmp_path / "libnss3.so",
        tmp_path / "libasound.so.2",
        tmp_path / "libatk-1.0.so.0",
        tmp_path / "libgtk-3.so.0",
    ]
    for lib in libs:
        lib.write_text("placeholder")

    monkeypatch.setattr(run_demo_tests, "_PLAYWRIGHT_LIB_PATHS", tuple(libs))
    monkeypatch.setattr(run_demo_tests.shutil, "which", lambda name: "/usr/bin/xvfb")
    monkeypatch.setattr(run_demo_tests.sys, "platform", "linux")

    assert run_demo_tests._playwright_system_deps_ready() is True


def test_playwright_dep_readiness_requires_xvfb(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    libs = [tmp_path / "libnss3.so"]
    libs[0].write_text("placeholder")

    monkeypatch.setattr(run_demo_tests, "_PLAYWRIGHT_LIB_PATHS", tuple(libs))
    monkeypatch.setattr(run_demo_tests.shutil, "which", lambda name: None)
    monkeypatch.setattr(run_demo_tests.sys, "platform", "linux")

    assert run_demo_tests._playwright_system_deps_ready() is False


def test_top_level_tests_pythonpath_includes_demo_root(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)

    pythonpath = run_demo_tests._build_pythonpath(tests_dir)

    # Ensure the parent ``demo`` directory is present so imports like ``demo``
    # or ``demo.run_demo_tests`` succeed when running the meta-suite in
    # isolation.
    assert str(demo_root.resolve()) in pythonpath.split(os.pathsep)


def test_discovers_node_suite_when_python_tests_absent(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "node-demo"
    tests_dir = project_dir / "tests"
    tests_dir.mkdir(parents=True)
    (project_dir / "package.json").write_text("{}\n")
    (project_dir / "package-lock.json").write_text("{}\n")
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=project_dir, tests_dir=tests_dir, runner="npm"
        )
    ]


def test_discovers_foundry_suite(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "foundry-demo"
    tests_dir = project_dir / "test"
    tests_dir.mkdir(parents=True)

    (project_dir / "foundry.toml").write_text("[profile.default]\n")
    (tests_dir / "Alpha.t.sol").write_text("// solidity test\n")

    monkeypatch.setattr(run_demo_tests.shutil, "which", lambda name: "/usr/bin/forge")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=project_dir, tests_dir=tests_dir, runner="forge"
        )
    ]


def test_foundry_installation_is_attempted_when_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "foundry-demo"
    tests_dir = project_dir / "test"
    tests_dir.mkdir(parents=True)

    (project_dir / "foundry.toml").write_text("[profile.default]\n")
    (tests_dir / "Alpha.t.sol").write_text("// solidity test\n")

    # Pretend forge is absent until the installer runs.
    state = {"installed": False}

    def fake_forge_exists() -> bool:
        return state["installed"]

    installs: list[dict[str, str]] = []

    def fake_install(env: dict[str, str]) -> bool:
        installs.append(env)
        state["installed"] = True
        return True

    monkeypatch.setattr(run_demo_tests, "_forge_exists", fake_forge_exists)
    monkeypatch.setattr(run_demo_tests, "_install_foundry", fake_install)
    run_demo_tests._foundry_install_attempted = False

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert installs, "installer should be invoked when forge is missing"
    assert suites == [
        run_demo_tests.Suite(
            demo_root=project_dir, tests_dir=tests_dir, runner="forge"
        )
    ]
    run_demo_tests._foundry_install_attempted = False


def test_foundry_installation_times_out_cleanly(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def _timeout(*args: object, **kwargs: object) -> object:
        raise subprocess.TimeoutExpired(cmd=args[0] if args else [], timeout=1)

    monkeypatch.setattr(subprocess, "run", _timeout)

    assert run_demo_tests._install_foundry({}) is False
    captured = capsys.readouterr().out
    assert "Timed out" in captured


def test_foundry_installation_can_be_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "foundry-demo"
    tests_dir = project_dir / "test"
    tests_dir.mkdir(parents=True)

    (project_dir / "foundry.toml").write_text("[profile.default]\n")
    (tests_dir / "Alpha.t.sol").write_text("// solidity test\n")

    monkeypatch.setattr(run_demo_tests, "_forge_exists", lambda: False)
    installs: list[dict[str, str]] = []
    monkeypatch.setattr(
        run_demo_tests, "_install_foundry", lambda env: installs.append(env) or True
    )
    run_demo_tests._foundry_install_attempted = False
    monkeypatch.setenv("DEMO_INSTALL_FOUNDRY", "0")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert not installs, "installer should not run when explicitly disabled"
    assert suites == []
    run_demo_tests._foundry_install_attempted = False


def test_discovers_pnpm_suite(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "pnpm-demo"
    tests_dir = project_dir / "__tests__"
    tests_dir.mkdir(parents=True)

    (project_dir / "package.json").write_text('{"packageManager": "pnpm@9.0.0"}\n')
    (project_dir / "pnpm-lock.yaml").write_text("lockfileVersion: 9.0\n")
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=project_dir, tests_dir=tests_dir, runner="pnpm"
        )
    ]


def test_deduplicates_node_packages(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    scripts_tests = demo_root / "scripts" / "__tests__"
    python_tests = demo_root / "tests"
    scripts_tests.mkdir(parents=True)
    python_tests.mkdir(parents=True)

    (demo_root / "package.json").write_text(
        '{"name": "phase-8", "scripts": {"test": "npm test"}}'
    )
    (demo_root / "package-lock.json").write_text("{}\n")

    (scripts_tests / "orchestrator.test.ts").write_text(
        "describe('node suite', () => { test('ok', () => {}); });\n"
    )
    (python_tests / "phase8.spec.ts").write_text(
        "describe('e2e', () => { test('ok', () => {}); });\n"
    )
    (python_tests / "test_manifest.py").write_text(
        "def test_manifest():\n    assert True\n"
    )

    suites = list(run_demo_tests._discover_tests(demo_root))

    python_suites = [
        suite for suite in suites if suite.runner == "python"
    ]
    node_suites = [
        suite for suite in suites if suite.runner == "npm"
    ]

    assert python_suites == [
        run_demo_tests.Suite(
            demo_root=python_tests,
            tests_dir=python_tests,
            runner="python",
        )
    ]
    assert node_suites == [
        run_demo_tests.Suite(
            demo_root=demo_root,
            tests_dir=scripts_tests,
            runner="npm",
        )
    ]


def test_pnpm_workspace_root_is_skipped(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    demo_root = tmp_path / "demo"
    workspace = demo_root / "workspace"
    tests_dir = workspace / "tests"
    tests_dir.mkdir(parents=True)

    (workspace / "package.json").write_text('{"packageManager": "pnpm@9.0.0"}\n')
    (workspace / "pnpm-lock.yaml").write_text("lockfileVersion: 9.0\n")
    (workspace / "pnpm-workspace.yaml").write_text("packages:\n  - packages/*\n")
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == []
    output = capsys.readouterr().out.lower()
    assert "workspace root" in output


def test_pnpm_workspace_root_without_node_tests_is_ignored(
    tmp_path: Path, capsys: pytest.CaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_root = tmp_path / "demo"
    workspace = demo_root / "workspace"
    tests_dir = workspace / "test"
    tests_dir.mkdir(parents=True)

    (workspace / "package.json").write_text('{"packageManager": "pnpm@9.0.0"}\n')
    (workspace / "pnpm-lock.yaml").write_text("lockfileVersion: 9.0\n")
    (workspace / "pnpm-workspace.yaml").write_text("packages:\n  - packages/*\n")
    (workspace / "foundry.toml").write_text("[profile.default]\n")
    (tests_dir / "Alpha.t.sol").write_text("// solidity test\n")

    monkeypatch.setattr(run_demo_tests.shutil, "which", lambda name: f"/usr/bin/{name}")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=workspace, tests_dir=tests_dir, runner="forge"
        )
    ]
    output = capsys.readouterr().out.lower()
    assert "workspace root" not in output


def test_node_suite_anchors_to_nearest_package(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "node-demo"
    nested_project = project_dir / "v2"
    tests_dir = nested_project / "tests"
    tests_dir.mkdir(parents=True)

    (nested_project / "package.json").write_text("{}\n")
    (nested_project / "package-lock.json").write_text("{}\n")
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=nested_project, tests_dir=tests_dir, runner="npm"
        )
    ]


def test_python_and_node_suites_can_share_tests_dir(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "shared" / "tests"
    tests_dir.mkdir(parents=True)

    (demo_root / "package.json").write_text("{}\n")
    (demo_root / "package-lock.json").write_text("{}\n")
    (tests_dir / "test_alpha.py").write_text("def test_alpha():\n    assert True\n")
    (tests_dir / "alpha.test.ts").write_text("describe('ok', () => {});\n")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=demo_root / "shared",
            tests_dir=tests_dir,
            runner="python",
        ),
        run_demo_tests.Suite(
            demo_root=demo_root,
            tests_dir=tests_dir,
            runner="npm",
        ),
    ]


def test_discovers_package_above_nested_tests_dir(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "node-demo"
    nested_tests = project_dir / "subsystem" / "__tests__"
    nested_tests.mkdir(parents=True)

    (project_dir / "package.json").write_text("{}\n")
    (project_dir / "package-lock.json").write_text("{}\n")
    (nested_tests / "ledger.test.ts").write_text("describe('ok', () => {});")

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=project_dir,
            tests_dir=nested_tests,
            runner="npm",
        )
    ]


def test_prisma_client_generation_is_triggered(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "node-demo"
    tests_dir = project_dir / "tests"
    tests_dir.mkdir(parents=True)

    package_json = {
        "dependencies": {"@prisma/client": "latest"},
        "packageManager": "npm@9.0.0",
    }
    (project_dir / "package.json").write_text(json.dumps(package_json))
    (project_dir / "package-lock.json").write_text("{}\n")
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    calls: list[tuple[Path, dict[str, object] | None]] = []
    monkeypatch.setattr(run_demo_tests, "_has_prisma_client", lambda _: False)
    monkeypatch.setattr(
        run_demo_tests,
        "_ensure_prisma_client",
        lambda root, meta: calls.append((root, meta)) or True,
    )

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert suites == [
        run_demo_tests.Suite(
            demo_root=project_dir,
            tests_dir=tests_dir,
            runner="npm",
        )
    ]
    assert calls == [(project_dir, package_json)]


def test_prisma_client_generation_is_skipped_for_list_mode(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_root = tmp_path / "demo"
    project_dir = demo_root / "node-demo"
    tests_dir = project_dir / "tests"
    tests_dir.mkdir(parents=True)

    package_json = {
        "dependencies": {"@prisma/client": "latest"},
        "packageManager": "npm@9.0.0",
    }
    (project_dir / "package.json").write_text(json.dumps(package_json))
    (project_dir / "package-lock.json").write_text("{}\n")
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    monkeypatch.setattr(run_demo_tests, "_has_prisma_client", lambda _: False)
    monkeypatch.setattr(
        run_demo_tests,
        "_ensure_prisma_client",
        lambda *_: (_ for _ in ()).throw(
            AssertionError("Prisma client generation should not run in --list mode")
        ),
    )

    exit_code = run_demo_tests.main(["--list"], demo_root=demo_root)

    assert exit_code == 0


def test_prisma_client_detection_requires_generated_artifacts(tmp_path: Path) -> None:
    project_dir = tmp_path / "node-demo"
    runtime = project_dir / "node_modules" / "@prisma" / "client" / "runtime"
    runtime.mkdir(parents=True)

    assert run_demo_tests._has_prisma_client(project_dir) is False

    generated = project_dir / "node_modules" / ".prisma" / "client"
    generated.mkdir(parents=True)

    assert run_demo_tests._has_prisma_client(project_dir) is True


def test_prisma_client_generation_is_cached_per_package(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_root = tmp_path / "demo"
    package_root = demo_root / "workspace"
    tests_a = package_root / "alpha" / "tests"
    tests_b = package_root / "beta" / "tests"
    for path in (tests_a, tests_b):
        path.mkdir(parents=True)
        (path / "alpha.test.ts").write_text("// placeholder")

    package_json = {
        "dependencies": {"@prisma/client": "latest"},
        "packageManager": "npm@9.0.0",
    }
    (package_root / "package.json").write_text(json.dumps(package_json))
    (package_root / "package-lock.json").write_text("{}\n")

    calls: list[tuple[Path, dict[str, object] | None]] = []
    monkeypatch.setattr(run_demo_tests, "_has_prisma_client", lambda _: False)
    monkeypatch.setattr(
        run_demo_tests,
        "_ensure_prisma_client",
        lambda root, meta: calls.append((root, meta)) or True,
    )

    suites = list(run_demo_tests._discover_tests(demo_root))

    assert len(suites) == 1
    assert calls == [(package_root, package_json)]


def test_empty_suite_fails_without_allow_empty(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    # Present a test file that collects nothing so pytest exits with code 5.
    (tests_dir / "test_empty.py").write_text("# no tests yet\n")

    exit_code = run_demo_tests.main(["--runtime-dir", str(tmp_path / "runtime")], demo_root=demo_root)

    assert exit_code == 1


def test_allow_empty_downgrades_empty_suite_to_warning(tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "test_empty.py").write_text("# no tests yet\n")

    exit_code = run_demo_tests.main(
        ["--runtime-dir", str(tmp_path / "runtime"), "--allow-empty"],
        demo_root=demo_root,
    )

    assert exit_code == 0


def test_main_reports_durations_and_slowest_suites(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    demo_root = tmp_path / "demo"
    alpha_tests = demo_root / "alpha" / "tests"
    beta_tests = demo_root / "beta" / "tests"
    for tests_dir in (alpha_tests, beta_tests):
        tests_dir.mkdir(parents=True)

    suites: Iterable[run_demo_tests.Suite] = (
        run_demo_tests.Suite(demo_root=alpha_tests.parent, tests_dir=alpha_tests, runner="python"),
        run_demo_tests.Suite(demo_root=beta_tests.parent, tests_dir=beta_tests, runner="python"),
    )

    timings = iter([0.0, 0.25, 0.25, 1.0])
    monkeypatch.setattr(run_demo_tests, "_discover_tests", lambda *_, **__: suites)
    monkeypatch.setattr(run_demo_tests, "_run_suite", lambda *_, **__: (0, None))
    monkeypatch.setattr(run_demo_tests.time, "perf_counter", lambda: next(timings))

    exit_code = run_demo_tests.main(["--runtime-dir", str(tmp_path / "runtime")], demo_root=demo_root)

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "total 1.00s" in output
    assert "Slowest suites:" in output
    assert str(beta_tests) in output


def test_node_suites_run_in_ci_mode(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)

    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="npm")
    captured_env: dict[str, str] = {}

    class _Result:
        returncode = 0

    def _fake_run(cmd: list[str], **kwargs: object) -> _Result:
        captured_env.update(kwargs.get("env", {}))
        return _Result()

    monkeypatch.setattr(subprocess, "run", _fake_run)

    exit_code, _ = run_demo_tests._run_suite(suite, {}, timeout=1)

    assert exit_code == 0
    assert captured_env["CI"].lower() in {"1", "true"}
    assert captured_env["npm_config_progress"] == "false"
    assert captured_env["npm_config_fund"] == "false"


def test_node_suites_use_runtime_root_playwright_cache(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "example" / "tests"
    tests_dir.mkdir(parents=True)

    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="npm")
    runtime_root = tmp_path / "runtime-root"
    captured_env: dict[str, str] = {}

    class _Result:
        returncode = 0

    def _fake_run(cmd: list[str], **kwargs: object) -> _Result:
        captured_env.update(kwargs.get("env", {}))
        return _Result()

    monkeypatch.setattr(subprocess, "run", _fake_run)

    exit_code, _ = run_demo_tests._run_suite(
        suite, {"DEMO_RUNTIME_ROOT": str(runtime_root)}, timeout=1
    )

    assert exit_code == 0
    cache_path = Path(captured_env["PLAYWRIGHT_BROWSERS_PATH"])
    assert cache_path.is_relative_to(runtime_root / ".cache")


def test_foundry_suites_set_ci_profile(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "test"
    tests_dir.mkdir(parents=True)
    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="forge")
    captured: dict[str, object] = {}

    class _Result:
        returncode = 0

    def _fake_run(cmd: list[str], **kwargs: object) -> _Result:
        captured.update(
            {
                "cmd": cmd,
                "env": kwargs.get("env"),
                "cwd": kwargs.get("cwd"),
            }
        )
        return _Result()

    monkeypatch.setattr(subprocess, "run", _fake_run)

    exit_code, _ = run_demo_tests._run_suite(suite, {}, timeout=1)

    assert exit_code == 0
    assert captured["cmd"][:3] == ["forge", "test", "--root"]
    assert captured["cmd"][3] == str(demo_root)
    env = captured["env"]
    assert isinstance(env, dict)
    assert env["FOUNDRY_PROFILE"].lower() == "ci"
    assert str(Path.home() / ".foundry" / "bin") in env["PATH"]
    assert captured["cwd"] == demo_root


def test_phase8_skips_playwright_dep_install_when_ready(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo_root = tmp_path / "Phase-8-Universal-Value-Dominance"
    tests_dir = demo_root / "tests"
    demo_root.mkdir()
    tests_dir.mkdir()

    captured_env: dict[str, str] = {}

    class _Result:
        returncode = 0

    def _fake_run(cmd: list[str], **kwargs: object) -> _Result:
        captured_env.update(kwargs.get("env", {}))  # type: ignore[arg-type]
        return _Result()

    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="npm")

    monkeypatch.setattr(run_demo_tests, "_can_install_playwright_deps", lambda: True)
    monkeypatch.setattr(run_demo_tests, "_playwright_system_deps_ready", lambda: True)
    monkeypatch.setattr(subprocess, "run", _fake_run)

    code, _ = run_demo_tests._run_suite(suite, {})

    assert code == 0
    assert captured_env["PLAYWRIGHT_INSTALL_WITH_DEPS"] == "0"


def test_vitest_suites_use_single_thread_pool(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    demo_root = tmp_path / "demo"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)
    (demo_root / "package.json").write_text('{"scripts": {"test": "vitest run"}}')

    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="npm")
    commands: list[list[str]] = []

    class _Result:
        returncode = 0

    def _fake_run(cmd: list[str], **kwargs: object) -> _Result:
        commands.append(cmd)
        return _Result()

    monkeypatch.setattr(subprocess, "run", _fake_run)

    exit_code, _ = run_demo_tests._run_suite(suite, {}, timeout=1)

    assert exit_code == 0
    assert commands
    command = commands[0]
    assert "--runInBand" not in command
    assert "--pool" in command


def test_node_suite_reports_missing_runner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture
) -> None:
    demo_root = tmp_path / "node-demo"
    tests_dir = demo_root / "tests"
    tests_dir.mkdir(parents=True)
    (tests_dir / "ledger.test.ts").write_text("describe('ok', () => {});")

    suite = run_demo_tests.Suite(demo_root=demo_root, tests_dir=tests_dir, runner="npm")

    # Remove PATH entries to force a FileNotFoundError for npm during the run.
    monkeypatch.setenv("PATH", str(tmp_path / "bin"))

    exit_code, _ = run_demo_tests._run_suite(suite, env_overrides={})

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "npm" in captured.out
    assert "PATH" in captured.out
