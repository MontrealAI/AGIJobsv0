from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def manifest() -> dict:
    path = Path(__file__).resolve().parent.parent / "config" / "universal.value.manifest.json"
    with path.open() as handle:
        return json.load(handle)


def test_global_contract_addresses_are_well_formed(manifest: dict) -> None:
    global_cfg = manifest.get("global")
    assert isinstance(global_cfg, dict), "global section must exist"

    address_fields = {
        "treasury",
        "universalVault",
        "upgradeCoordinator",
        "validatorRegistry",
        "missionControl",
        "knowledgeGraph",
        "guardianCouncil",
        "systemPause",
        "phase8Manager",
    }
    missing = address_fields - set(global_cfg)
    assert not missing, f"missing expected global keys: {missing}"

    for field in address_fields:
        value = global_cfg[field]
        assert isinstance(value, str) and value.startswith("0x") and len(value) == 42, (
            f"{field} must be a 20-byte hex address"
        )

    assert global_cfg.get("heartbeatSeconds", 0) > 0
    assert global_cfg.get("guardianReviewWindow", 0) >= global_cfg.get("heartbeatSeconds", 1)
    assert 0 <= global_cfg.get("maxDrawdownBps", -1) <= 10_000


def test_domains_have_consistent_risk_budget(manifest: dict) -> None:
    domains = manifest.get("domains")
    assert isinstance(domains, list) and domains, "domains list must be populated"

    for domain in domains:
        assert set(
            {
                "slug",
                "name",
                "metadataURI",
                "orchestrator",
                "capitalVault",
                "validatorModule",
                "policyKernel",
                "heartbeatSeconds",
                "tvlLimit",
                "autonomyLevelBps",
                "resilienceIndex",
                "valueFlowMonthlyUSD",
                "autonomyNarrative",
                "active",
            }
        ).issubset(domain), f"domain missing required keys: {domain}"

        assert isinstance(domain["slug"], str) and domain["slug"], "slug required"
        assert domain["heartbeatSeconds"] > 0, "heartbeat must be positive"
        assert 0 <= domain["autonomyLevelBps"] <= 10_000, "autonomy level must be basis points"
        assert domain["resilienceIndex"] <= 1.0, "resilience index is capped at 1.0"

        # TVL strings should be parseable to an int representing wei.
        tvl_limit = domain["tvlLimit"]
        assert isinstance(tvl_limit, str), "tvlLimit must be string"
        tvl_value = int(tvl_limit)
        assert tvl_value > 0, "tvlLimit must be positive"

        # Value flow should be non-negative and proportional to autonomy level.
        assert domain["valueFlowMonthlyUSD"] >= 0
        assert domain["valueFlowMonthlyUSD"] >= domain["autonomyLevelBps"] * 1_000_000, (
            "value flow should scale with autonomy envelope"
        )

        for address_field in ("orchestrator", "capitalVault", "validatorModule", "policyKernel"):
            value = domain[address_field]
            assert isinstance(value, str) and value.startswith("0x") and len(value) == 42, (
                f"{address_field} must be a 20-byte hex address"
            )

        # Each domain should declare at least one skill tag to anchor governance.
        assert domain.get("skillTags"), "skillTags must not be empty"
