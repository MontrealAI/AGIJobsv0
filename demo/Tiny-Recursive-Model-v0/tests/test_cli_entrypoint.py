import importlib.util
import sys
from pathlib import Path

from typer.testing import CliRunner

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "run_demo.py"
spec = importlib.util.spec_from_file_location("trm_run_demo", MODULE_PATH)
run_demo = importlib.util.module_from_spec(spec)
if spec.loader is None:  # pragma: no cover - defensive
    raise RuntimeError("Unable to load Tiny Recursive Model run_demo module")
sys.modules[spec.name] = run_demo
spec.loader.exec_module(run_demo)


runner = CliRunner()


def test_default_invocation_shows_help_and_exits_cleanly():
    result = runner.invoke(run_demo.app, [])

    assert result.exit_code == 0
    assert "Tiny Recursive Model" in result.stdout
    assert "train" in result.stdout
    assert "simulate" in result.stdout
    assert "explain" in result.stdout
