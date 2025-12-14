import asyncio
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "run_demo.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("alpha_node_run_demo", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)  # type: ignore[arg-type]
    return module


@pytest.fixture(autouse=True)
def _restore_sys_path():
    original = list(sys.path)
    yield
    sys.path[:] = original


def test_bootstrap_allows_direct_execution(monkeypatch):
    # Remove project paths to ensure the module re-injects them.
    sys.path = [p for p in sys.path if "AGI-Alpha-Node-v0" not in p]
    module = _load_module()

    assert str(module.PROJECT_ROOT) in sys.path
    assert str(module.REPO_ROOT) in sys.path


def test_demo_job_runs_without_server(monkeypatch):
    module = _load_module()

    calls = {
        "demo_job": 0,
        "served": 0,
    }

    async def fake_demo_job():
        calls["demo_job"] += 1

    class DummyServer:
        def __init__(self):
            calls["served"] += 1
            self.should_exit = False

        async def serve(self):
            while not self.should_exit:
                await asyncio.sleep(0)

    monkeypatch.setattr(module, "_build_server", lambda *_, **__: DummyServer())

    asyncio.run(module.main(run_server=True, demo_job_fn=fake_demo_job))

    assert calls["demo_job"] == 1
    assert calls["served"] == 1
