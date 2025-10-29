from pathlib import Path

from validator_constellation.demo_runner import run_validator_constellation_scenario


def test_yaml_scenario_execution():
    scenario_path = Path(__file__).resolve().parent.parent / "config" / "stellar-scenario.yaml"
    summary = run_validator_constellation_scenario(scenario_path, seed_override="mission-42")

    assert summary.scenario_name == "stellar-sentinel-constellation"
    assert summary.committee_signature == "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    assert not summary.batch_proof_root.startswith("0x")  # hashed string without prefix
    assert summary.gas_saved > 0
    assert summary.sentinel_alerts, "expected sentinel alerts from scenario anomalies"
    assert summary.domain_events, "expected domain pause/resume events to be recorded"
    assert summary.entropy_sources is not None and "onChainEntropy" in summary.entropy_sources
    assert summary.verifying_key == "0xf1f2f3f4f5f6f7f8f9fafbfcfdfeff00112233445566778899aabbccddeeff0011"
    assert summary.context.get("operator") == "Non-technical mission director"
    assert any(action["action"] == "treasury-distribution" for action in summary.owner_actions)
