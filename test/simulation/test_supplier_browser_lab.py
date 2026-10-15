"""Adversarial bounds for the optional Alpha browser laboratory helpers."""

import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

FILE = (
    Path(__file__).resolve().parents[2]
    / "integrations/alpha-agent/supplier_browser_lab_support.py"
)
spec = importlib.util.spec_from_file_location("lab_support", FILE)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class LaboratoryBounds(unittest.TestCase):
    def test_unsupported_platform_cannot_claim_group_closure(self):
        with patch.object(helper.sys, "platform", "darwin"):
            with self.assertRaises(RuntimeError):
                helper.live_group_members(os.getpid())

    def test_unread_stdin_has_absolute_deadline(self):
        read, write = os.pipe()
        try:
            start = time.monotonic()
            with self.assertRaises(TimeoutError):
                helper.write_frame(write, {"large": "x" * 1_000_000}, start + 0.1)
            self.assertLess(time.monotonic() - start, 1)
        finally:
            os.close(read)
            os.close(write)

    def test_partial_line_stall_has_absolute_deadline(self):
        read, write = os.pipe()
        try:
            os.write(write, b'{"unfinished":')
            start = time.monotonic()
            with self.assertRaises(TimeoutError):
                helper.read_frame(read, bytearray(), start + 0.1)
            self.assertLess(time.monotonic() - start, 1)
        finally:
            os.close(read)
            os.close(write)

    def test_batched_frames_preserve_buffer(self):
        read, write = os.pipe()
        try:
            os.write(write, b'{"first":1}\n{"second":2}\n')
            buffer = bytearray()
            self.assertEqual(
                helper.read_frame(read, buffer, time.monotonic() + 1), {"first": 1}
            )
            self.assertEqual(
                helper.read_frame(read, buffer, time.monotonic() + 1), {"second": 2}
            )
        finally:
            os.close(read)
            os.close(write)

    def test_oversize_unterminated_frame_rejected(self):
        read, write = os.pipe()
        try:
            os.write(write, b"x" * 21)
            with self.assertRaises(ValueError):
                helper.read_frame(read, bytearray(), time.monotonic() + 1, maximum=20)
        finally:
            os.close(read)
            os.close(write)

    def test_child_ignoring_term_does_not_survive_leader(self):
        code = """import os,signal,time
pid=os.fork()
if pid == 0:
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 print('ready',flush=True)
 while True: time.sleep(1)
else:
 while True: time.sleep(1)
"""
        process = subprocess.Popen(
            [sys.executable, "-u", "-c", code],
            stdout=subprocess.PIPE,
            start_new_session=True,
        )
        try:
            self.assertEqual(process.stdout.readline(), b"ready\n")
            result = helper.terminate_group(process)
            self.assertTrue(result["leaderExited"])
            self.assertTrue(result["groupClosed"])
            self.assertEqual(result["liveGroupMembers"], [])
        finally:
            helper.terminate_group(process)
            process.stdout.close()


if __name__ == "__main__":
    unittest.main()
