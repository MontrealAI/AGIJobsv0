import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "demo/OMNI-CONCORD-ASCENSION-ATLAS/run.py"
spec = importlib.util.spec_from_file_location("atlas_recovery", RUN)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SCENARIO = RUN.with_name("scenario.json")


class AtlasRecovery(unittest.TestCase):
    def test_parser_rejects_bom_utf16_and_malformed_utf8(self):
        for raw in [b"\xef\xbb\xbf{}", "{}".encode("utf-16"), b"\xff{}"]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                module.parse(raw)


    def scenario(self):
        return json.loads(SCENARIO.read_text())

    def test_recovery_retains_completed_work_and_charges_both_attempts(self):
        result = module.evaluate(self.scenario())
        self.assertTrue(result["accepted"])
        self.assertEqual(result["firstPass"]["spentCents"], 9000)
        self.assertEqual(result["spentCents"], 19000)
        self.assertEqual(result["remainingCents"], 1000)
        self.assertEqual(result["completionMinute"], 95)
        self.assertEqual([a["id"] for a in result["attempts"]].count("inspect"), 1)
        self.assertEqual([a["id"] for a in result["attempts"]].count("repair"), 2)
        self.assertFalse(result["executedExternalWork"])
        self.assertFalse(result["settlementApproved"])

    def test_failed_prerequisite_blocks_dependents_but_not_independent_branch(self):
        scenario = self.scenario()
        scenario["recoveredIds"] = []
        result = module.evaluate(scenario)
        status = {j["id"]: j["status"] for j in result["jobs"]}
        self.assertEqual(
            status,
            {
                "inspect": "completed",
                "repair": "failed",
                "verify": "blocked-dependency",
                "audit": "completed",
                "report": "blocked-dependency",
            },
        )
        self.assertFalse(result["accepted"])
        self.assertIsNone(result["completionMinute"])

    def test_budget_cannot_be_reused_or_overspent(self):
        scenario = self.scenario()
        scenario["budgetCents"] = 18000
        result = module.evaluate(scenario)
        self.assertFalse(result["accepted"])
        self.assertEqual(result["spentCents"], 18000)
        self.assertEqual(result["remainingCents"], 0)
        self.assertEqual(result["jobs"][-1]["status"], "blocked-budget")
        self.assertEqual(result["jobs"][-1]["shortfallCents"], 1000)
        scenario["budgetCents"] = 19000
        self.assertTrue(module.evaluate(scenario)["accepted"])

    def test_zero_budget_executes_no_attempt(self):
        scenario = self.scenario()
        scenario["budgetCents"] = 0
        result = module.evaluate(scenario)
        self.assertEqual(result["attempts"], [])
        self.assertEqual(result["spentCents"], 0)
        self.assertFalse(result["accepted"])

    def test_cycle_missing_and_duplicate_jobs_fail_closed(self):
        for edit in [
            lambda s: s["jobs"][0]["dependsOn"].append("report"),
            lambda s: s["jobs"][0]["dependsOn"].append("absent"),
            lambda s: s["jobs"].append(copy.deepcopy(s["jobs"][0])),
        ]:
            scenario = self.scenario()
            edit(scenario)
            with self.assertRaises(ValueError):
                module.evaluate(scenario)

    def test_invalid_types_unknown_fields_and_recovery_identity_rejected(self):
        for edit in [
            lambda s: s.update(extra=True),
            lambda s: s.update(budgetCents=True),
            lambda s: s.update(recoveredIds=["inspect"]),
            lambda s: s.update(recoveredIds=["repair", "repair"]),
            lambda s: s["jobs"][0].update(costCents=-1),
            lambda s: s["jobs"][0].update(outcome={}),
            lambda s: s["jobs"][0].update(dependsOn=["audit", "audit"]),
        ]:
            scenario = self.scenario()
            edit(scenario)
            with self.assertRaises(ValueError):
                module.evaluate(scenario)

    def test_stable_order_and_dependency_finish_times(self):
        results = [module.evaluate(self.scenario()) for _ in range(5)]
        self.assertTrue(all(r == results[0] for r in results))
        attempts = results[0]["attempts"]
        self.assertEqual(
            [a["startMinute"] for a in attempts if a["id"] == "audit"], [0]
        )
        self.assertEqual(
            [a["startMinute"] for a in attempts if a["id"] == "verify"], [70]
        )
        self.assertEqual(
            results[0]["order"], ["inspect", "repair", "verify", "audit", "report"]
        )

    def test_cli_commits_exact_input_and_has_friendly_invalid_exit(self):
        completed = subprocess.run(
            [sys.executable, str(RUN)], capture_output=True, text=True
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(
            json.loads(completed.stdout)["scenarioSha256"],
            hashlib.sha256(SCENARIO.read_bytes()).hexdigest(),
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "scenario.json"
            for expected, raw in zip(
                [2, 2, 1],
                [
                    '{"schema":1,"schema":2}',
                    '{"ignored":NaN}',
                    SCENARIO.read_text().replace(
                        '"recoveredIds": ["repair"]', '"recoveredIds": []'
                    ),
                ],
            ):
                path.write_text(raw)
                result = subprocess.run(
                    [sys.executable, str(RUN), "--scenario", str(path)],
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, expected)
                self.assertNotIn("Traceback", result.stderr)
            missing = subprocess.run(
                [
                    sys.executable,
                    str(RUN),
                    "--scenario",
                    str(path.with_name("missing.json")),
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(missing.returncode, 2)
            self.assertNotIn("Traceback", missing.stderr)


if __name__ == "__main__":
    unittest.main()
