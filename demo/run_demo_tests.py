"""Execute every demo test suite in isolated subprocesses.

Running ``pytest demo`` directly previously led to import collisions across
independent demos. This runner scans each demo's test directory, builds a
per-suite ``PYTHONPATH`` that includes that demo's packages (``src``/``python``
folders, ``grand_demo`` stubs, etc.), and executes pytest in a fresh
interpreter. The isolation keeps overlapping module names from interfering
with one another while still allowing a single command to validate the
entire demo gallery.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import ctypes.util
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Literal
import urllib.error
import urllib.request
import tomllib


@dataclass(frozen=True)
class Suite:
    demo_root: Path
    tests_dir: Path
    runner: Literal["python", "npm", "pnpm", "yarn", "forge"]


def _candidate_paths(demo_root: Path) -> Iterable[Path]:
    for relative in (
        "grand_demo/alpha_node",
        "grand_demo",
        "src",
        "python",
        ".",
        "grandiose_alpha_demo/src",
    ):
        candidate = demo_root / relative
        if candidate.is_dir():
            yield candidate

    # Meta-suites live directly under ``demo/tests`` and need the demo root on
    # ``sys.path`` to import the runner itself (``demo.run_demo_tests``).
    if demo_root.name == "tests" and demo_root.parent.is_dir():
        yield demo_root.parent


def _build_pythonpath(demo_root: Path) -> str:
    entries: list[str] = []
    seen: set[str] = set()

    def _remember(path: Path) -> None:
        resolved = str(path.resolve())
        if resolved and resolved not in seen:
            seen.add(resolved)
            entries.append(resolved)

    for path in _candidate_paths(demo_root):
        _remember(path)

    existing = os.environ.get("PYTHONPATH")
    if existing:
        for segment in existing.split(os.pathsep):
            if segment:
                _remember(Path(segment))

    return os.pathsep.join(entries)


def _normalize_include_filters(raw: Iterable[str]) -> set[str] | None:
    """Expand ``--demo`` filters, supporting comma-separated tokens.

    Users sometimes pass multiple filter values in a single argument
    (for example, ``--demo alpha,beta``). Normalizing here lets the
    discovery layer remain simple while still honoring flexible CLI
    input patterns.
    """

    tokens: set[str] = set()

    for value in raw:
        for part in value.split(","):
            cleaned = part.strip()
            if cleaned:
                tokens.add(cleaned.lower())

    return tokens or None


def _configure_runtime_env(runtime_root: Path) -> dict[str, str]:
    """Route orchestrator state into a temporary sandbox."""

    storage_root = runtime_root / "orchestrator"
    overrides = {
        "ORCHESTRATOR_SCOREBOARD_PATH": storage_root / "scoreboard.json",
        "ORCHESTRATOR_CHECKPOINT_PATH": storage_root / "checkpoint.json",
        "ORCHESTRATOR_CHECKPOINT_LEVELDB": storage_root / "checkpoint.db",
        "ORCHESTRATOR_GOVERNANCE_PATH": storage_root / "governance.json",
        "ORCHESTRATOR_STATE_DIR": storage_root / "runs",
        "AGENT_REGISTRY_PATH": storage_root / "agents" / "registry.json",
        "DEMO_RUNTIME_ROOT": runtime_root,
    }

    for path in overrides.values():
        target = Path(path)
        if target.suffix:
            target.parent.mkdir(parents=True, exist_ok=True)
        else:
            target.mkdir(parents=True, exist_ok=True)

    return {key: str(value) for key, value in overrides.items()}


def _suite_runtime_root(
    base_runtime: Path, demo_dir: Path, tests_dir: Path, *, runner: str | None = None
) -> Path:
    """Derive a unique sandbox path for a demo test suite.

    Multiple demos share common directory names such as ``grand_demo/tests``.
    Using only the immediate parent directory for isolation can therefore
    collapse distinct suites into the same runtime sandbox, allowing state to
    bleed across runs. Anchoring the sandbox by demo name and the tests
    directory's relative location keeps each suite hermetic.
    """

    relative_tests_path = tests_dir.relative_to(demo_dir)
    base = base_runtime / demo_dir.name / relative_tests_path
    return base / runner if runner else base


def _can_install_playwright_deps() -> bool:
    """Return True when the host can satisfy Playwright's system deps.

    The Phase-8 demo optionally requests ``--with-deps`` installs. On sandboxed
    hosts without ``apt-get`` or privilege escalation, forcing that flag leads
    to noisy failures. Detecting capability up front lets us opt-out cleanly
    while still running the full e2e suite whenever the environment allows it.
    """

    if not sys.platform.startswith("linux"):
        return False

    if shutil.which("apt-get") is None:
        return False

    try:
        if os.geteuid() == 0:
            return True
    except AttributeError:
        # Windows/POSIX shims may not expose geteuid; fall back to sudo check.
        pass

    sudo_path = shutil.which("sudo")
    if not sudo_path:
        return False

    try:
        # Ensure sudo can run without prompting for a password. Non-zero exit
        # codes (or environments that block sudo entirely) should skip the
        # dependency install instead of hanging the test runner.
        result = subprocess.run(
            [sudo_path, "-n", "true"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return False

    return result.returncode == 0


def _run_suite(
    suite: Suite,
    env_overrides: dict[str, str],
    *,
    allow_empty: bool = False,
    timeout: float | None = None,
) -> int:
    env = os.environ.copy()
    env.update(env_overrides)

    if suite.runner in {"npm", "pnpm", "yarn"}:
        # Force non-interactive, reproducible Node runs. CI ensures tools like
        # Vitest or Jest avoid watch mode and exit after executing the suite,
        # while disabling progress and fund prompts removes noisy network
        # calls that can otherwise hang or slow demos in sandboxed
        # environments.
        env.setdefault("CI", "1")
        env.setdefault("npm_config_progress", "false")
        env.setdefault("npm_config_fund", "false")
        # Playwright-heavy demos can attempt to install system dependencies
        # when they see CI=1. Default to a repo-local browser cache and opt
        # out of apt-get installs unless callers explicitly request them via
        # PLAYWRIGHT_INSTALL_WITH_DEPS=1. This keeps the aggregate demo run
        # fast and non-invasive while still allowing suites to download the
        # browser binaries they need.
        playwright_cache = suite.demo_root / ".cache" / "ms-playwright"
        playwright_cache.mkdir(parents=True, exist_ok=True)
        env.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(playwright_cache))
        env.setdefault("PLAYWRIGHT_INSTALL_WITH_DEPS", "0")
        # Ensure any system package installs triggered by Playwright or other
        # tooling run non-interactively. This prevents hangs in CI when apt
        # prompts for locale/timezone configuration or sudo escalation.
        env.setdefault("DEBIAN_FRONTEND", "noninteractive")
        if "Phase-8-Universal-Value-Dominance" in str(suite.demo_root):
            # The Phase-8 demo exercises a browser-backed validation path; it
            # needs Playwright's system dependencies available even in CI-like
            # environments. Opt in explicitly when the host can satisfy them,
            # and otherwise allow the suite to skip e2e checks instead of
            # failing outright on locked-down runners.
            if _can_install_playwright_deps() and not _playwright_system_deps_ready():
                env["PLAYWRIGHT_INSTALL_WITH_DEPS"] = "1"
            else:
                env["PLAYWRIGHT_INSTALL_WITH_DEPS"] = "0"
                if not _playwright_system_deps_ready():
                    env.setdefault("PLAYWRIGHT_OPTIONAL_E2E", "1")
        binary = suite.runner
        cmd = [binary, "test", *_node_runner_args(suite.demo_root)]
        description = f"{suite.tests_dir} via {binary} test"
        cwd = suite.demo_root
    elif suite.runner == "forge":
        forge_path = shutil.which("forge") or "forge"
        default_foundry_path = Path.home() / ".foundry" / "bin"
        env.setdefault("FOUNDRY_PROFILE", "ci")
        env["PATH"] = os.pathsep.join(
            [str(default_foundry_path), env.get("PATH", "")]
        )
        _maybe_prefetch_solc(suite, env)
        cmd = [forge_path, "test", "--root", str(suite.demo_root)]
        description = f"{suite.tests_dir} via forge test"
        cwd = suite.demo_root
    else:
        env.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
        env["PYTHONPATH"] = _build_pythonpath(suite.demo_root)
        cmd = [
            sys.executable,
            "-m",
            "pytest",
            str(suite.tests_dir),
            "--import-mode=importlib",
        ]
        description = f"{suite.tests_dir} with PYTHONPATH={env['PYTHONPATH']}"
        cwd = suite.tests_dir.parent

    print(f"\n→ Running {description}")
    run_kwargs = {"env": env, "check": False, "cwd": cwd}

    adjusted_timeout = _maybe_extend_timeout_for_playwright(suite, env, timeout)
    if adjusted_timeout is not None:
        run_kwargs["timeout"] = adjusted_timeout

    try:
        result = subprocess.run(cmd, **run_kwargs)
    except FileNotFoundError:
        missing_binary = cmd[0]
        print(
            f"⛔️  Required executable '{missing_binary}' is not available on PATH "
            f"while running {suite.tests_dir}. Install it or adjust PATH to "
            "continue."
        )
        return 1
    except subprocess.TimeoutExpired:
        print(
            f"⏰  Timed out running {suite.tests_dir} after {timeout}s; "
            "investigate slow or hanging demos."
        )
        return 1

    if suite.runner == "python" and result.returncode == 5:
        message = (
            "⚠️  No tests were collected for this suite. "
            "Confirm the tests directory contains runnable files."
        )
        if allow_empty:
            print(message)
            return 0

        print(f"⛔️  {message}")
        return result.returncode

    return result.returncode


def _has_python_tests(tests_dir: Path) -> bool:
    """Return True when a tests directory contains at least one Python test file.

    Some demos include JavaScript/TypeScript test harnesses that are intentionally
    outside our Python test runner's scope. Skipping those directories keeps the
    run focused on actionable suites and avoids noisy "collected 0 items"
    reports that make it harder to spot real failures.
    """

    for file in tests_dir.rglob("*.py"):
        name = file.name
        if name.startswith("test") or name.endswith("_test.py"):
            return True
    return False


_NODE_TEST_EXTENSIONS = {".js", ".ts", ".jsx", ".tsx"}


def _iter_node_test_files(tests_dir: Path) -> Iterable[Path]:
    """Yield Node-oriented test files if present beneath ``tests_dir``."""

    for pattern in ("*.test.*", "*.spec.*"):
        for file in tests_dir.rglob(pattern):
            if file.suffix in _NODE_TEST_EXTENSIONS:
                yield file


def _node_package_root(tests_dir: Path, demo_dir: Path) -> Path | None:
    """Return the nearest ancestor with a package.json, stopping at ``demo_dir``."""

    for ancestor in [tests_dir, *tests_dir.parents]:
        if (ancestor / "package.json").is_file():
            return ancestor
        if ancestor == demo_dir.parent:
            break

    return None


def _foundry_project_root(tests_dir: Path, demo_dir: Path) -> Path | None:
    """Return the nearest ancestor with a foundry.toml, stopping at ``demo_dir``."""

    for ancestor in [tests_dir, *tests_dir.parents]:
        if (ancestor / "foundry.toml").is_file():
            return ancestor
        if ancestor == demo_dir.parent:
            break

    return None


def _load_package_meta(package_root: Path) -> dict[str, object] | None:
    try:
        return json.loads((package_root / "package.json").read_text())
    except (OSError, json.JSONDecodeError):
        return None


def _node_package_manager(
    package_root: Path, package_meta: dict[str, object] | None
) -> str | None:
    if package_meta is None:
        return None

    lockfiles = {
        "npm": ("package-lock.json", "npm-shrinkwrap.json"),
        "pnpm": ("pnpm-lock.yaml",),
        "yarn": ("yarn.lock",),
    }
    for manager, names in lockfiles.items():
        if any((package_root / name).is_file() for name in names):
            return manager

    manager = str(package_meta.get("packageManager", "")).lower()
    if manager.startswith("npm"):
        return "npm"
    if manager.startswith("pnpm"):
        return "pnpm"
    if manager.startswith("yarn"):
        return "yarn"

    return None


def _requires_prisma_generation(package_meta: dict[str, object]) -> bool:
    deps = package_meta.get("dependencies", {}) or {}
    dev_deps = package_meta.get("devDependencies", {}) or {}
    return "@prisma/client" in deps or "@prisma/client" in dev_deps


def _has_prisma_client(package_root: Path) -> bool:
    node_modules = package_root / "node_modules"
    generated = node_modules / ".prisma" / "client"
    if generated.exists():
        return True

    client_package = node_modules / "@prisma" / "client"
    runtime_library = client_package / "runtime" / "library.js"
    if not runtime_library.exists():
        return False

    # Prisma 6+ may inline the client into the package runtime directory
    # instead of emitting ``node_modules/.prisma``. The runtime files alone
    # ship with the npm package, so require the client to confirm generation
    # actually happened before skipping a generate pass.
    try:
        result = subprocess.run(
            ["node", "-e", "require('@prisma/client')"],
            cwd=package_root,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except FileNotFoundError:
        return False
    except subprocess.TimeoutExpired:
        return False

    return result.returncode == 0


def _prisma_cli_version(package_meta: dict[str, object] | None) -> str | None:
    """Infer the Prisma CLI version from package metadata."""

    if not package_meta:
        return None

    for section in ("devDependencies", "dependencies"):
        deps = package_meta.get(section, {}) or {}
        if isinstance(deps, dict):
            version = deps.get("prisma")
            if isinstance(version, str) and version.strip():
                return version.strip()

    # Fall back to the client version; Prisma keeps CLI/client pairs in lockstep.
    deps = package_meta.get("dependencies", {}) or {}
    if isinstance(deps, dict):
        version = deps.get("@prisma/client")
        if isinstance(version, str) and version.strip():
            return version.strip()

    return None


def _ensure_prisma_client(
    package_root: Path, package_meta: dict[str, object] | None
) -> bool:
    if _has_prisma_client(package_root):
        return True

    print(f"→ Generating Prisma client for {package_root} (missing artifacts)")
    env = os.environ.copy()
    env.setdefault("CI", "1")
    env.setdefault("NPM_CONFIG_YES", "true")
    env.setdefault("npm_config_progress", "false")
    env.setdefault("npm_config_fund", "false")

    version = _prisma_cli_version(package_meta)
    prisma_specifier = f"prisma@{version}" if version else "prisma"

    try:
        result = subprocess.run(
            ["npx", "--yes", prisma_specifier, "generate"],
            cwd=package_root,
            env=env,
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        print(
            "→ Skipping Prisma-dependent suite because 'npx' is not available on PATH."
        )
        return False
    except subprocess.TimeoutExpired:
        print(
            "→ Skipping Prisma-dependent suite because Prisma client generation "
            "timed out; rerun `npx --yes prisma generate` manually to debug."
        )
        return False

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        print(
            "→ Skipping Prisma-dependent suite because client generation failed; "
            "run `npx prisma generate` manually to debug.\n"
            f"   stderr: {stderr or 'no stderr captured'}"
        )
        return False

    if not _has_prisma_client(package_root):
        print(
            "→ Skipping Prisma-dependent suite because generated client artifacts "
            "were not detected even though `prisma generate` succeeded; inspect "
            f"{package_root}/node_modules for Prisma outputs."
        )
        return False

    return True


def _node_runner_args(package_root: Path) -> list[str]:
    """Return npm arguments that encourage single-threaded runs when supported."""

    package_json = package_root / "package.json"
    try:
        package_meta = json.loads(package_json.read_text())
    except (OSError, json.JSONDecodeError):
        return []

    test_script = str(package_meta.get("scripts", {}).get("test", "")).lower()

    if "vitest" in test_script:
        return ["--", "--pool", "threads", "--poolOptions.threads.singleThread", "true"]
    if "jest" in test_script or "run-tests.js" in test_script:
        return ["--", "--runInBand"]

    return []


def _uses_playwright(package_meta: dict[str, object] | None) -> bool:
    if not package_meta:
        return False

    def _contains_playwright(section: str) -> bool:
        deps = package_meta.get(section, {}) or {}
        return any(
            name in deps
            for name in ("@playwright/test", "playwright", "playwright-core")
        )

    if _contains_playwright("dependencies") or _contains_playwright("devDependencies"):
        return True

    scripts = package_meta.get("scripts", {}) or {}
    return any("playwright" in str(command).lower() for command in scripts.values())


def _playwright_cache_ready(env: dict[str, str]) -> bool:
    cache = env.get("PLAYWRIGHT_BROWSERS_PATH")
    if not cache:
        return False

    cache_root = Path(cache)
    try:
        for child in cache_root.iterdir():
            if child.is_dir() and child.name.startswith("chromium"):
                return True
    except OSError:
        return False

    return False


_PLAYWRIGHT_LIB_PATHS = (
    Path("/usr/lib/x86_64-linux-gnu/libnss3.so"),
    Path("/usr/lib/x86_64-linux-gnu/libasound.so.2"),
    Path("/usr/lib/x86_64-linux-gnu/libatk-1.0.so.0"),
    Path("/usr/lib/x86_64-linux-gnu/libgtk-3.so.0"),
)


def _playwright_system_deps_ready() -> bool:
    """Return True when common Playwright system deps are already installed.

    Playwright's ``--with-deps`` mode triggers ``apt-get update`` on every run,
    which can add minutes of overhead once the machine is already provisioned.
    A quick readiness probe lets us skip that work while still opting into the
    dependency installer when libraries are genuinely missing.
    """

    if not sys.platform.startswith("linux"):
        return False

    if not shutil.which("xvfb"):
        return False

    for lib in _PLAYWRIGHT_LIB_PATHS:
        if lib.exists():
            continue
        resolved = ctypes.util.find_library(lib.stem.replace(".so", ""))
        if not resolved:
            return False

    return True


def _maybe_extend_timeout_for_playwright(
    suite: Suite, env: dict[str, str], timeout: float | None
) -> float | None:
    """Give Playwright suites more time to download browsers on first run."""

    if timeout is None or suite.runner not in {"npm", "pnpm", "yarn"}:
        return timeout

    package_json = suite.demo_root / "package.json"
    package_meta = _load_package_meta(package_json.parent) if package_json.is_file() else None
    if not _uses_playwright(package_meta):
        return timeout

    extended_timeout = max(timeout, 240.0)
    if extended_timeout != timeout:
        cache_root = env.get("PLAYWRIGHT_BROWSERS_PATH", "unknown")
        cache_state = (
            "warm cache detected" if _playwright_cache_ready(env) else "no cached browsers"
        )
        print(
            f"   ↪️  Extending timeout to {extended_timeout:.0f}s for Playwright suite "
            f"({cache_state}, cache: {cache_root})."
        )
    return extended_timeout


def _foundry_solc_version(project_root: Path) -> str | None:
    config = project_root / "foundry.toml"
    if not config.is_file():
        return None

    try:
        parsed = tomllib.loads(config.read_text())
    except (OSError, tomllib.TOMLDecodeError):
        return None

    profile = parsed.get("profile", {}).get("default", {})
    version = profile.get("solc_version")
    if isinstance(version, str):
        cleaned = version.strip()
        if cleaned:
            return cleaned

    return None


def _resolve_solc_artifact(version: str) -> tuple[str, str] | None:
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "linux" and machine in ("x86_64", "amd64"):
        platform_key = "linux-amd64"
    elif system == "linux" and machine in ("aarch64", "arm64"):
        platform_key = "linux-arm64"
    elif system == "darwin" and machine in ("x86_64", "amd64"):
        platform_key = "macosx-amd64"
    elif system == "darwin" and machine in ("arm64", "aarch64"):
        platform_key = "macosx-arm64"
    else:
        print(
            "→ Skipping solc prefetch on unsupported host platform; "
            "forge will attempt to download a native compiler."
        )
        return None

    manifest_url = f"https://binaries.soliditylang.org/{platform_key}/list.json"
    try:
        with urllib.request.urlopen(manifest_url, timeout=30) as response:
            manifest = json.load(response)
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
        print(
            f"→ Unable to fetch Solidity release manifest ({exc}); "
            "forge will attempt to download the compiler directly."
        )
        return None

    release_key = manifest.get("releases", {}).get(version)
    if not isinstance(release_key, str) or not release_key.strip():
        print(
            f"→ No solc artifact mapping found for version '{version}'; "
            "forge will attempt to download the compiler directly."
        )
        return None

    base_url = f"https://binaries.soliditylang.org/{platform_key}"
    return base_url, release_key


def _maybe_prefetch_solc(suite: Suite, env: dict[str, str]) -> None:
    runtime_root_raw = env.get("DEMO_RUNTIME_ROOT")
    solc_version = _foundry_solc_version(suite.demo_root)

    if not runtime_root_raw or not solc_version:
        return

    resolved = _resolve_solc_artifact(solc_version)
    if not resolved:
        return

    base_url, artifact = resolved
    runtime_root = Path(runtime_root_raw)
    cache_dir = runtime_root / "solc-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / artifact

    if not target.exists():
        try:
            with urllib.request.urlopen(f"{base_url}/{artifact}", timeout=120) as response:
                with target.open("wb") as handle:
                    shutil.copyfileobj(response, handle)
            target.chmod(0o755)
            print(f"→ Prefetched solc {solc_version} to {target}")
        except (OSError, urllib.error.URLError) as exc:
            print(
                f"→ Unable to prefetch solc {solc_version} ({exc}); "
                "forge will attempt its own download."
            )
            return

    env.setdefault("FOUNDRY_SOLC", str(target))


def _forge_exists() -> bool:
    default_foundry_path = Path.home() / ".foundry" / "bin" / "forge"
    return shutil.which("forge") is not None or default_foundry_path.exists()


_foundry_install_attempted = False


def _install_foundry(env: dict[str, str], *, timeout: int = 120) -> bool:
    """Install Foundry non-interactively if it is not already available.

    A timeout is applied to each step so that environments without outbound
    network access fail fast instead of hanging forever.
    """

    bootstrap = ["bash", "-c", "curl -L https://foundry.paradigm.xyz | bash"]
    try:
        result = subprocess.run(
            bootstrap,
            check=False,
            env={**env, "CI": env.get("CI", "1")},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            text=True,
        )
    except subprocess.TimeoutExpired:
        print("→ Timed out while downloading Foundry bootstrap script; skipping.")
        return False

    if result.returncode != 0:
        return False

    foundryup = Path.home() / ".foundry" / "bin" / "foundryup"
    if not foundryup.exists():
        return False

    try:
        install = subprocess.run(
            [str(foundryup), "--no-modify-path", "-y"],
            check=False,
            env={**env, "CI": env.get("CI", "1"), "FOUNDRYUP_NO_ANALYTICS": "1"},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            text=True,
        )
    except subprocess.TimeoutExpired:
        print("→ Timed out while running foundryup; skipping Foundry suites.")
        return False

    return install.returncode == 0


def _ensure_foundry_available(
    env: dict[str, str] | None = None,
    *,
    installer: Callable[[dict[str, str]], bool] | None = None,
) -> bool:
    """Try to make ``forge`` available so Foundry suites are executed."""

    global _foundry_install_attempted

    if _forge_exists():
        return True

    env = env or os.environ
    allow_install = (
        env.get("DEMO_INSTALL_FOUNDRY", "1").lower() not in {"0", "false", "no"}
    )
    if not allow_install:
        return False

    installer = installer or _install_foundry

    if _foundry_install_attempted:
        return _forge_exists()

    _foundry_install_attempted = True
    if not installer(env):
        return False

    return _forge_exists()


def _has_foundry_tests(
    tests_dir: Path, demo_dir: Path
) -> Path | bool | None:
    project_root = _foundry_project_root(tests_dir, demo_dir)
    if not project_root:
        return None

    has_tests = any(file.name.endswith(".t.sol") for file in tests_dir.rglob("*.sol"))
    if not has_tests:
        return False

    if not _ensure_foundry_available():
        print(
            f"→ Skipping {tests_dir} (forge is not available on PATH; "
            "install Foundry via foundryup to run these suites)"
        )
        return False

    return project_root


def _has_node_tests(
    tests_dir: Path,
    demo_dir: Path,
    *,
    generate_prisma: bool = True,
    prisma_cache: dict[Path, bool] | None = None,
) -> tuple[Path, str] | bool | None:
    has_node_tests = any(_iter_node_test_files(tests_dir))
    if not has_node_tests:
        return None

    package_root = _node_package_root(tests_dir, demo_dir)
    if not package_root:
        return None

    package_meta = _load_package_meta(package_root)

    manager = _node_package_manager(package_root, package_meta)
    if not manager:
        print(
            f"→ Skipping {tests_dir} (unsupported Node package manager; "
            "add npm, pnpm, or yarn lock metadata to enable this suite)"
        )
        return False

    if (
        manager == "pnpm"
        and (package_root / "pnpm-workspace.yaml").exists()
        and package_root == demo_dir
    ):
        print(
            f"→ Skipping {tests_dir} (pnpm workspace root detected; "
            "add a package-level package.json near these tests to enable them)"
        )
        return False

    if package_meta and _requires_prisma_generation(package_meta):
        if prisma_cache is not None:
            cached = prisma_cache.get(package_root)
            if cached is False:
                return False
            if cached is None and generate_prisma:
                prisma_cache[package_root] = _ensure_prisma_client(
                    package_root, package_meta
                )
            if prisma_cache.get(package_root) is False:
                return False
        elif generate_prisma and not _ensure_prisma_client(package_root, package_meta):
            return False

    return package_root, manager


_SKIP_TEST_PARTS = {"node_modules", ".venv", "venv", ".tox", ".git"}
_TEST_DIR_NAMES = {"tests", "test", "__tests__"}


def _discover_tests(
    demo_root: Path, *, include: set[str] | None = None, generate_prisma: bool = True
) -> Iterable[Suite]:
    node_packages_seen: set[tuple[Path, str]] = set()
    prisma_cache: dict[Path, bool] = {}

    def _iter_tests_dirs(root: Path) -> Iterable[Path]:
        # Some suites (e.g., the runner's own tests) live directly under a
        # ``tests`` directory instead of nested beneath a demo package. rglob
        # does not yield the starting directory when it already matches the
        # pattern, so we surface it explicitly.
        candidates: set[Path] = set()

        if root.name in _TEST_DIR_NAMES:
            candidates.add(root)

        for current_dir, dirnames, _ in os.walk(root):
            path_dir = Path(current_dir)
            dirnames[:] = [name for name in dirnames if name not in _SKIP_TEST_PARTS]
            for dirname in dirnames:
                if dirname in _TEST_DIR_NAMES:
                    candidates.add(path_dir / dirname)

        yield from sorted(candidates)

    def _matches_filter(path: Path) -> bool:
        if include is None:
            return True

        name = path.name.lower()
        relative = str(path.relative_to(demo_root)).lower()

        return any(
            token in name or token in relative or relative in token
            for token in include
        )

    # Iterate in a deterministic order so CI logs remain stable across runs.
    for demo_dir in sorted((p for p in demo_root.iterdir() if p.is_dir())):
        if not _matches_filter(demo_dir):
            continue
        for tests_dir in sorted(_iter_tests_dirs(demo_dir)):
            if not tests_dir.is_dir():
                continue
            if any(part in _SKIP_TEST_PARTS for part in tests_dir.parts):
                continue
            has_python = _has_python_tests(tests_dir)
            foundry_suite = _has_foundry_tests(tests_dir, demo_dir)
            node_suite = _has_node_tests(
                tests_dir,
                demo_dir,
                generate_prisma=generate_prisma,
                prisma_cache=prisma_cache,
            )

            if has_python:
                yield Suite(demo_root=demo_dir, tests_dir=tests_dir, runner="python")
            if foundry_suite:
                yield Suite(
                    demo_root=foundry_suite, tests_dir=tests_dir, runner="forge"
                )
            if node_suite:
                package_root, manager = node_suite
                key = (package_root, manager)
                if key in node_packages_seen:
                    print(
                        f"→ Skipping {tests_dir} (already scheduled node suite at {package_root})"
                    )
                else:
                    node_packages_seen.add(key)
                    yield Suite(
                        demo_root=package_root, tests_dir=tests_dir, runner=manager
                    )
            if not has_python and node_suite is None:
                print(f"→ Skipping {tests_dir} (no recognized test files found)")


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--demo",
        "--include",
        dest="demo",
        action="append",
        default=[],
        help=(
            "Only run demos whose directory names contain the provided substring. "
            "Can be supplied multiple times."
        ),
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List discovered suites (after filtering) without running them.",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help=(
            "Stop after the first failing suite instead of executing every demo. "
            "Use this in local runs to get the fastest feedback loop."
        ),
    )
    parser.add_argument(
        "--allow-empty",
        action="store_true",
        help=(
            "Treat suites with zero collected tests as a warning instead of an error. "
            "Use this for in-progress demos that intentionally ship without tests."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=None,
        help=(
            "Fail a suite if it exceeds the given runtime in seconds. "
            "Use this to detect hanging demo tests early."
        ),
    )
    parser.add_argument(
        "--runtime-dir",
        type=Path,
        default=None,
        help=(
            "Optional directory to store orchestrator runtime artifacts. "
            "When provided, sandboxes are kept after the run to aid debugging; "
            "otherwise a temporary directory is used and cleaned up automatically."
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None, demo_root: Path | None = None) -> int:
    args = _parse_args(argv)
    include = _normalize_include_filters(args.demo)
    demo_root = demo_root or Path(__file__).resolve().parent
    suites = list(
        _discover_tests(
            demo_root, include=include, generate_prisma=not args.list
        )
    )

    if args.list:
        if not suites:
            print("No demo test suites found for the provided filters.")
            return 1
        print("Discovered demo test suites:")
        for suite in suites:
            print(f" - {suite.tests_dir} [{suite.runner}]")
        return 0

    runtime_context: contextlib.AbstractContextManager[str]
    if args.runtime_dir:
        runtime_dir = args.runtime_dir.expanduser().resolve()
        runtime_dir.mkdir(parents=True, exist_ok=True)
        runtime_context = contextlib.nullcontext(str(runtime_dir))
    else:
        runtime_context = tempfile.TemporaryDirectory(prefix="demo-orchestrator-")

    with runtime_context as runtime_dir:
        runtime_root = Path(runtime_dir)

        if not suites:
            print("No demo test suites found for the provided filters.")
            return 1

        results: list[tuple[Suite, int, float]] = []
        try:
            for suite in suites:
                # Allocate an isolated runtime sandbox per suite to eliminate
                # cross-contamination between demos that rely on orchestrator state.
                suite_runtime = _suite_runtime_root(
                    runtime_root, suite.demo_root, suite.tests_dir, runner=suite.runner
                )
                if suite_runtime.exists():
                    shutil.rmtree(suite_runtime)
                env_overrides = _configure_runtime_env(suite_runtime)
                start = time.perf_counter()
                code = _run_suite(
                    suite,
                    env_overrides,
                    allow_empty=args.allow_empty,
                    timeout=args.timeout,
                )
                duration = time.perf_counter() - start
                results.append((suite, code, duration))

                print(f"   ↳ Completed in {duration:.2f}s (exit code {code}).")

                if args.fail_fast and code:
                    print(
                        "\n⛔️  Halting remaining demo suites because --fail-fast is enabled."
                    )
                    break
        except KeyboardInterrupt:
            completed = len(results)
            remaining = len(suites) - completed
            print(
                f"\n⚠️  Interrupted after {completed} of {len(suites)} suites; "
                f"{remaining} remaining."
            )
            return 130

        failed = [(suite, code, duration) for suite, code, duration in results if code]
        if failed:
            print("\n⚠️  Demo test runs completed with failures:")
            for suite, code, duration in failed:
                print(f"   • {suite.tests_dir} (exit code {code}, {duration:.2f}s)")
            return 1

        total_duration = sum(duration for _, __, duration in results)
        print(
            f"\n✅ All demo test suites passed ({len(results)} suites, "
            f"total {total_duration:.2f}s)."
        )

        if len(results) > 1:
            slowest = sorted(results, key=lambda entry: entry[2], reverse=True)[:3]
            print("   Slowest suites:")
            for suite, _, duration in slowest:
                print(f"   • {suite.tests_dir} — {duration:.2f}s")

        return 0


if __name__ == "__main__":
    raise SystemExit(main())
