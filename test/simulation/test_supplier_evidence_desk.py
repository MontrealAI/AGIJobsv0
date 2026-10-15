import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "demo/ICONIC-OPERATING-SYSTEM-DEMO/run.py"
spec = importlib.util.spec_from_file_location("evidence_desk", RUN)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
FIXTURE = RUN.with_name("packet.json")


class SupplierEvidenceDesk(unittest.TestCase):
    def packet(self):
        return json.loads(FIXTURE.read_text())

    def complete(self):
        p = self.packet()
        p["usage"] = {
            "inputTokens": 1000,
            "outputTokens": 200,
            "reportedCostMicrousd": 30000,
        }
        return p

    def test_actual_browser_deliverables_pass_but_unknown_usage_stays_unresolved(self):
        result = module.evaluate(self.packet())
        self.assertTrue(result["artifactReview"]["accepted"])
        self.assertFalse(result["packetComplete"])
        self.assertEqual(
            result["unresolvedGates"],
            [
                "usageKnown",
                "inputWithinPolicy",
                "outputWithinPolicy",
                "reportedCostWithinPolicy",
            ],
        )
        self.assertIsNone(result["usage"]["reportedCostMicrousd"])
        self.assertFalse(result["executionAttested"])
        self.assertFalse(result["costAttested"])

    def test_complete_reported_budget_packet_still_grants_no_authority(self):
        result = module.evaluate(self.complete())
        self.assertTrue(result["packetComplete"])
        self.assertEqual(result["unresolvedGates"], [])
        for field in [
            "admitted",
            "productionApproved",
            "settlementApproved",
            "executionAttested",
            "costAttested",
        ]:
            self.assertFalse(result[field])

    def test_wrong_recommendation_rejected_even_with_recomputed_hash(self):
        p = self.complete()
        file = p["receipt"]["artifacts"][0]
        report = json.loads(file["content"])
        report["recommendedSupplier"] = "Laurentian"
        file["content"] = json.dumps(report)
        file["sha256"] = hashlib.sha256(file["content"].encode()).hexdigest()
        result = module.evaluate(p)
        self.assertFalse(result["checks"]["artifactAcceptance"])
        self.assertFalse(result["packetComplete"])

    def test_bad_hash_task_identity_cleanup_and_claims_cannot_pass(self):
        for mutate, gate in [
            (
                lambda p: p["receipt"]["artifacts"][0].update(sha256="0" * 64),
                "artifactAcceptance",
            ),
            (lambda p: p.update(taskSourceSha256="0" * 64), "taskIdentity"),
            (
                lambda p: p["execution"].update(workerTerminated=False),
                "cleanupReported",
            ),
            (lambda p: p.update(productionApproved=True), "authorityClaimsAbsent"),
            (lambda p: p.update(settlementApproved=True), "authorityClaimsAbsent"),
            (
                lambda p: p["execution"].update(externalFetches=1),
                "zeroExternalFetchesReported",
            ),
        ]:
            p = self.complete()
            mutate(p)
            result = module.evaluate(p)
            self.assertFalse(result["checks"][gate])
            self.assertFalse(result["packetComplete"])

    def test_each_reported_budget_limit_is_enforced_including_exact_boundary(self):
        for field, limit, gate in [
            ("inputTokens", "maximumInputTokens", "inputWithinPolicy"),
            ("outputTokens", "maximumOutputTokens", "outputWithinPolicy"),
            ("reportedCostMicrousd", "maximumCostMicrousd", "reportedCostWithinPolicy"),
        ]:
            p = self.complete()
            p["usage"][field] = p["policy"][limit]
            self.assertTrue(module.evaluate(p)["checks"][gate])
            p["usage"][field] += 1
            self.assertFalse(module.evaluate(p)["checks"][gate])
        p = self.complete()
        p["execution"]["providerCalls"] = 4
        self.assertFalse(module.evaluate(p)["checks"]["callsWithinPolicy"])

    def test_unknown_cost_never_becomes_zero(self):
        p = self.complete()
        p["usage"]["reportedCostMicrousd"] = None
        result = module.evaluate(p)
        self.assertIsNone(result["usage"]["reportedCostMicrousd"])
        self.assertFalse(result["checks"]["reportedCostWithinPolicy"])
        p["usage"]["reportedCostMicrousd"] = 0
        self.assertTrue(module.evaluate(p)["checks"]["reportedCostWithinPolicy"])
        self.assertFalse(module.evaluate(p)["costAttested"])

    def test_strict_malformed_inputs_and_duplicate_artifact_json_reject(self):
        for mutate in [
            lambda p: p.update(extra=1),
            lambda p: p["usage"].update(inputTokens=True),
            lambda p: p["execution"].update(providerCalls=-1),
            lambda p: p["receipt"]["artifacts"][0].update(
                content='{"quotes":[],"quotes":[]}'
            ),
            lambda p: p["receipt"]["artifacts"][0].update(content="x" * 200001),
        ]:
            p = self.packet()
            mutate(p)
            with self.assertRaises(ValueError):
                module.evaluate(p)
        for raw in ['{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}']:
            with self.assertRaises(ValueError):
                module.parse(raw)

    def test_duplicate_or_unexpected_artifact_names_rejected(self):
        for name in ["comparison.json", "other.txt"]:
            packet = self.packet()
            packet["receipt"]["artifacts"][1]["name"] = name
            with self.assertRaises(ValueError):
                module.evaluate(packet)

    def test_malformed_comparisons_have_friendly_cli_exit_two(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "packet.json"
            for content in ["{", "null", "{}", '{"quotes":null}', '{"quotes":[null]}']:
                packet = self.packet()
                packet["receipt"]["artifacts"][0]["content"] = content
                path.write_text(json.dumps(packet))
                result = subprocess.run(
                    [sys.executable, str(RUN), "--packet", str(path)],
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, 2)
                self.assertNotIn("Traceback", result.stderr)

    def test_cli_exact_packet_hash_and_exit_status(self):
        result = subprocess.run(
            [sys.executable, str(RUN)], capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            json.loads(result.stdout)["packetSha256"],
            hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "packet.json"
            path.write_text(json.dumps(self.complete()))
            result = subprocess.run(
                [sys.executable, str(RUN), "--packet", str(path)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            path.write_text('{"a":NaN}')
            result = subprocess.run(
                [sys.executable, str(RUN), "--packet", str(path)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
