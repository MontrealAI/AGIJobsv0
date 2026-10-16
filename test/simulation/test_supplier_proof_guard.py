"""Offline negative tests for portable supplier proof preconditions."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "proof_guard", ROOT / "integrations/alpha-agent/supplier_proof_guard.py"
)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class ProofGuardTests(unittest.TestCase):
    def test_output_rejects_source_existing_relative_and_symlink_alias(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            source = root / "source"
            source.mkdir()
            alias = root / "alias"
            alias.symlink_to(source, target_is_directory=True)
            for value in [source, source / "new", alias / "new", Path("relative")]:
                with self.assertRaises(ValueError):
                    guard.output_path(value, [source])
            self.assertEqual(guard.output_path(root / "new", [source]), root / "new")

    def test_changed_pinned_source_fails_before_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "contract.sol").write_text("changed")
            with patch.object(
                subprocess, "check_output", side_effect=[b"contract.sol\n", b"original"]
            ):
                with self.assertRaisesRegex(ValueError, "Pinned source mismatch"):
                    guard.verify_sources(root)

    def test_missing_pinned_source_fails(self):
        with patch.object(subprocess, "check_output", return_value=b""):
            with self.assertRaisesRegex(ValueError, "Pinned source is unavailable"):
                guard.verify_sources(Path("/unused"))

    def test_compiler_input_mutation_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "contract.sol").write_text("source")
            build = root / "artifacts/build-info"
            build.mkdir(parents=True)
            (build / "one.json").write_text(
                json.dumps(
                    {
                        "solcLongVersion": "0.8.37+commit.f401782d.Emscripten.clang",
                        "input": {"sources": {"contract.sol": {"content": "changed"}}},
                    }
                )
            )
            with patch.object(
                subprocess, "check_output", side_effect=[b"contract.sol\n", b"source"]
            ):
                with self.assertRaisesRegex(ValueError, "Compiler input mismatch"):
                    guard.verify_sources(root)

    def test_compiler_path_and_unpinned_source_rejected_before_read(self):
        for name in [
            "/etc/passwd",
            "../outside.sol",
            "contracts/untracked.sol",
            "@vendor/../../outside",
        ]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                (root / "contract.sol").write_text("source")
                build = root / "artifacts/build-info"
                build.mkdir(parents=True)
                (build / "one.json").write_text(
                    json.dumps(
                        {
                            "solcLongVersion": "0.8.37+commit.f401782d.Emscripten.clang",
                            "input": {"sources": {name: {"content": "untrusted"}}},
                        }
                    )
                )
                with patch.object(
                    subprocess,
                    "check_output",
                    side_effect=[b"contract.sol\n", b"source"],
                ):
                    with self.assertRaisesRegex(
                        ValueError,
                        "Unsafe compiler input path|Unpinned compiler source",
                    ):
                        guard.verify_sources(root)

    def test_dead_node_startup_fails_without_rpc(self):
        import os

        with tempfile.TemporaryDirectory() as temporary:
            env = {
                **os.environ,
                "SUPPLIER_NODE_PID": "99999999",
                "SUPPLIER_PROOF_OUTPUT": temporary,
            }
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "integrations/alpha-agent/supplier_node_guard.py"),
                    "start",
                ],
                env=env,
                capture_output=True,
                timeout=3,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b"exited before readiness", result.stderr)

    def test_cleanup_kills_signal_ignoring_group_and_records_closure(self):
        import os, time

        with tempfile.TemporaryDirectory() as temporary:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    'import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);print("ready",flush=True);time.sleep(30)',
                ],
                stdout=subprocess.PIPE,
                start_new_session=True,
            )
            try:
                self.assertEqual(process.stdout.readline(), b"ready\n")
                env = {
                    **os.environ,
                    "SUPPLIER_NODE_PID": str(process.pid),
                    "SUPPLIER_PROOF_OUTPUT": temporary,
                }
                result = subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / "integrations/alpha-agent/supplier_node_guard.py"),
                        "cleanup",
                    ],
                    env=env,
                    capture_output=True,
                    timeout=8,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(
                    json.loads((Path(temporary) / "node-cleanup.json").read_text())[
                        "groupClosed"
                    ]
                )
                process.wait(timeout=1)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=1)
                process.stdout.close()


if __name__ == "__main__":
    unittest.main()
