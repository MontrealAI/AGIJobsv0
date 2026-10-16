"""Behavioral acceptance tests for the bounded governance scenario."""

import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "demo/solving-alpha-agi-governance"
spec = importlib.util.spec_from_file_location("governance_rehearsal", DEMO / "run.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GovernanceRehearsalTests(unittest.TestCase):
    def test_parser_rejects_bom_utf16_and_malformed_utf8(self):
        for raw in [b"\xef\xbb\xbf{}", "{}".encode("utf-16"), b"\xff{}"]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                module.parse_scenario(raw)


    def setUp(self):
        self.scenario = json.loads((DEMO / "scenario.json").read_text())

    def test_acceptance_is_bounded_and_never_enacts(self):
        result = module.evaluate(self.scenario)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["remainingCentsIfApproved"], 80000)
        self.assertEqual(result["castWeight"], 90)
        self.assertFalse(result["enacted"])
        self.assertFalse(result["settlementApproved"])
        self.assertEqual(result["mode"], "offline-simulation")

    def test_each_independent_policy_gate_rejects(self):
        for name in ["quorum", "approval", "budget", "ownerControls"]:
            scenario = copy.deepcopy(self.scenario)
            if name == "quorum":
                scenario["policy"]["quorumPercent"] = 95
            elif name == "approval":
                scenario["policy"]["approvalPercent"] = 80
            elif name == "budget":
                scenario["proposal"]["requestedCents"] = 500001
            else:
                scenario["controls"].remove("pause")
            with self.subTest(name=name):
                result = module.evaluate(scenario)
                self.assertFalse(result["accepted"])
                self.assertEqual(result["reasons"], [name])
                self.assertEqual(result["remainingCentsIfApproved"], 500000)

    def test_threshold_uses_exact_integer_comparison(self):
        self.scenario["policy"]["approvalPercent"] = 70
        self.scenario["votes"][-1]["weight"] = 30
        self.assertTrue(module.evaluate(self.scenario)["accepted"])
        self.scenario["votes"][0]["weight"] -= 1
        self.scenario["votes"][-1]["weight"] += 1
        self.assertFalse(module.evaluate(self.scenario)["checks"]["approval"])

    def test_duplicate_voters_excess_weight_and_boolean_numbers_fail(self):
        variants = []
        duplicate = copy.deepcopy(self.scenario)
        duplicate["votes"].append(duplicate["votes"][0])
        variants.append(duplicate)
        overweight = copy.deepcopy(self.scenario)
        overweight["votes"][0]["weight"] = 99
        variants.append(overweight)
        boolean = copy.deepcopy(self.scenario)
        boolean["proposal"]["requestedCents"] = True
        variants.append(boolean)
        for scenario in variants:
            with self.assertRaises(ValueError):
                module.evaluate(scenario)

    def test_malformed_identifiers_and_empty_controls_fail_closed(self):
        for field, value in [("id", {}), ("id", "../outside")]:
            scenario = copy.deepcopy(self.scenario)
            scenario["proposal"][field] = value
            with self.assertRaises(ValueError):
                module.evaluate(scenario)
        self.scenario["controls"] = []
        with self.assertRaises(ValueError):
            module.evaluate(self.scenario)

    def test_abstentions_count_toward_quorum_and_approval_denominator(self):
        self.scenario["votes"][-1]["choice"] = "abstain"
        self.assertTrue(module.evaluate(self.scenario)["accepted"])
        self.scenario["policy"]["approvalPercent"] = 80
        result = module.evaluate(self.scenario)
        self.assertTrue(result["checks"]["quorum"])
        self.assertFalse(result["checks"]["approval"])

    def test_strict_json_rejects_duplicate_nonfinite_and_unknown_keys(self):
        for raw in [
            b'{"title":"a","title":"b"}',
            b'{"extra":NaN}',
            b'{"extra":Infinity}',
            b'{"extra":-Infinity}',
        ]:
            with self.assertRaises(ValueError):
                module.parse_scenario(raw)
        self.scenario["unexpected"] = "ignored would be unsafe"
        with self.assertRaises(ValueError):
            module.evaluate(self.scenario)

    def test_missing_file_is_friendly_exit_two(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    str(DEMO / "run.py"),
                    "--scenario",
                    str(Path(directory) / "absent.json"),
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("Invalid scenario:", result.stderr)
            self.assertNotIn("Traceback", result.stderr)

    def test_cli_has_hashed_input_and_nonzero_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            scenario = Path(directory) / "scenario.json"
            for expected in [0, 1]:
                if expected:
                    self.scenario["controls"].remove("review")
                scenario.write_text(json.dumps(self.scenario))
                process = subprocess.run(
                    [sys.executable, str(DEMO / "run.py"), "--scenario", str(scenario)],
                    cwd=directory,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(process.returncode, expected, process.stderr)
                result = json.loads(process.stdout)
                self.assertEqual(len(result["scenarioSha256"]), 64)
                self.assertEqual(result["accepted"], expected == 0)


if __name__ == "__main__":
    unittest.main()
