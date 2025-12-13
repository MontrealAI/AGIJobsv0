from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_wrapper_module():
    wrapper_path = Path(__file__).resolve().parents[2] / "run_demo.py"
    spec = importlib.util.spec_from_file_location("meta_agentic_run_demo", wrapper_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader  # for mypy/static checkers
    spec.loader.exec_module(module)  # type: ignore[call-arg]
    return module


def test_run_demo_forwards_arguments(monkeypatch):
    wrapper = _load_wrapper_module()
    captured = {}

    def fake_main():
        captured["argv"] = list(sys.argv)

    wrapper.run(["--list-scenarios", "--output", "demo_output"], main_fn=fake_main)

    assert captured["argv"][1:] == ["--list-scenarios", "--output", "demo_output"]


def test_ensure_sys_path_idempotent():
    wrapper = _load_wrapper_module()
    original_sys_path = list(sys.path)

    wrapper._ensure_sys_path()
    wrapper._ensure_sys_path()

    repo_root = str(wrapper.REPO_ROOT)
    demo_root = str(wrapper.DEMO_ROOT)
    assert repo_root in sys.path
    assert demo_root in sys.path
    assert sys.path.count(repo_root) == 1
    assert sys.path.count(demo_root) == 1

    sys.path[:] = original_sys_path
