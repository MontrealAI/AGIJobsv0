"""The bounded smoke/help launcher must never silently dispatch training."""

from pathlib import Path
import runpy
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "demo/MuZero-style-v0/scripts/run_demo.py"


class MuZeroLauncherTests(unittest.TestCase):
    def invoke(self, arguments):
        calls = []
        cli = types.ModuleType("muzero_demo.cli")
        cli.app = lambda argv: calls.append(argv)
        with patch.dict(sys.modules, {"muzero_demo.cli": cli}), patch.object(
            sys, "argv", [str(SCRIPT), *arguments]
        ):
            runpy.run_path(str(SCRIPT), run_name="__main__")
        return calls

    def test_smoke_command_and_exact_config_forwarded(self):
        args = ["smoke-tests", "--config", "scenario.yaml"]
        self.assertEqual(self.invoke(args), [args])

    def test_help_and_unknown_arguments_are_not_replaced(self):
        for args in [["--help"], ["unknown"], ["eval", "--config", "custom.yaml"]]:
            self.assertEqual(self.invoke(args), [args])

    def test_no_argument_default_remains_explicit_demo(self):
        calls = self.invoke([])
        self.assertEqual(calls[0][:2], ["demo", "--config"])
        self.assertEqual(
            Path(calls[0][2]), SCRIPT.parents[1] / "config/muzero_demo.yaml"
        )


class DependencyAbsentTests(unittest.TestCase):
    def command(self, *args):
        # -S hides site packages, guaranteeing this regression needs no Torch install.
        return subprocess.run(
            [sys.executable, "-S", str(SCRIPT), *args],
            capture_output=True,
            text=True,
            timeout=10,
        )

    def test_help_without_optional_dependencies(self):
        for args in [("--help",), ("smoke-tests", "--help")]:
            result = self.command(*args)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("config" if len(args) > 1 else "smoke-tests", result.stdout)
            self.assertNotIn("Traceback", result.stderr)

    def test_execution_reports_missing_dependency_without_training(self):
        result = self.command("smoke-tests", "--config", "unused.yaml")
        self.assertEqual(result.returncode, 2)
        self.assertIn("runtime dependency", result.stderr)
        self.assertIn("Install PyTorch", result.stderr)
        self.assertIn("No training was started", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


class PublicApiTests(unittest.TestCase):
    def test_cli_public_callables_remain_lazy_and_preserved(self):
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "muzero_demo.cli", SCRIPT.parents[1] / "muzero_demo/cli.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        runtime = types.ModuleType("muzero_demo.cli_runtime")
        names = [
            "run_demo",
            "run_smoke_tests",
            "run_eval",
            "load_config",
            "prepare_device",
        ]
        for name in names:
            setattr(runtime, name, lambda *args: None)
        package = types.ModuleType("muzero_demo")
        package.cli_runtime = runtime
        with patch.dict(
            sys.modules, {"muzero_demo": package, "muzero_demo.cli_runtime": runtime}
        ):
            for name in names:
                self.assertIs(getattr(module, name), getattr(runtime, name))
        with self.assertRaises(AttributeError):
            getattr(module, "nonexistent")
