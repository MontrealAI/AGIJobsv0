from pathlib import Path
import sys
from types import SimpleNamespace

PACKAGE_PARENT = Path(__file__).resolve().parents[2]
if str(PACKAGE_PARENT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_PARENT))

import astral_omnidominion_operating_system.run_demo as compatibility


class _Recorder:
    def __init__(self):
        self.calls = []

    def __call__(self, cmd, *, check, cwd):
        self.calls.append((cmd, check, cwd))
        return SimpleNamespace(returncode=42)


def test_run_delegates_to_primary_entrypoint(tmp_path):
    runner = _Recorder()
    exit_code = compatibility.run(["--mission", "alpha"], runner=runner, is_interactive=lambda: True)

    assert exit_code == 42
    assert runner.calls, "run() should invoke the provided runner"
    cmd, check, cwd = runner.calls[0]
    assert cmd[:3] == ["npm", "run", "demo:agi-os:first-class"]
    assert cmd[-2:] == ["--mission", "alpha"]
    assert check is False
    # The primary wrapper pins the working directory to the repository root.
    assert Path(cwd).resolve() == Path(__file__).resolve().parents[3]


def test_run_honors_non_interactive_defaults():
    runner = _Recorder()
    exit_code = compatibility.run([], runner=runner, is_interactive=lambda: False)

    assert exit_code == 42
    cmd, *_ = runner.calls[0]
    assert cmd[-5:] == ["--network", "localhost", "--yes", "--no-compose", "--skip-deploy"]
