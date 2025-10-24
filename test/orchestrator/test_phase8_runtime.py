from __future__ import annotations

import json
from pathlib import Path

import pytest

from orchestrator.extensions import Phase8DominionRuntime, load_phase8_runtime
from orchestrator.models import Step


@pytest.fixture()
def manifest_payload() -> dict:
    return {
        "global": {
            "treasury": "0x1111111111111111111111111111111111111111",
            "universalVault": "0x2222222222222222222222222222222222222222",
            "upgradeCoordinator": "0x3333333333333333333333333333333333333333",
            "validatorRegistry": "0x4444444444444444444444444444444444444444",
            "missionControl": "0x5555555555555555555555555555555555555555",
            "knowledgeGraph": "0x6666666666666666666666666666666666666666",
            "guardianCouncil": "0x7777777777777777777777777777777777777777",
            "systemPause": "0x8888888888888888888888888888888888888888",
            "heartbeatSeconds": 540,
            "guardianReviewWindow": 720,
            "maxDrawdownBps": 3200,
            "manifestoURI": "ipfs://phase8/demo/manifest.json",
            "manifestoHash": "0x3c0842c55548b2d2972b57504c6c582b7b4c8cd02b5113b122d2e825282a4b49",
        },
        "domains": [
            {
                "slug": "climate-array",
                "name": "Climate Array",
                "metadataURI": "ipfs://phase8/domains/climate.json",
                "orchestrator": "0x9999999999999999999999999999999999999999",
                "capitalVault": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                "validatorModule": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
                "policyKernel": "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
                "heartbeatSeconds": 210,
                "tvlLimit": "185000000000000000000000000",
                "autonomyLevelBps": 7600,
                "skillTags": ["climate", "energy", "resilience"],
                "resilienceIndex": 0.932,
                "valueFlowMonthlyUSD": 128000000000,
                "autonomyNarrative": "Self-healing climate stabilization mesh.",
                "active": True,
            },
            {
                "slug": "planetary-finance",
                "name": "Planetary Finance Mesh",
                "metadataURI": "ipfs://phase8/domains/finance.json",
                "orchestrator": "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
                "capitalVault": "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
                "validatorModule": "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
                "policyKernel": "0x1234567890abcdef1234567890abcdef12345678",
                "heartbeatSeconds": 300,
                "tvlLimit": "420000000000000000000000000",
                "autonomyLevelBps": 7200,
                "skillTags": ["finance", "liquidity"],
                "resilienceIndex": 0.951,
                "valueFlowMonthlyUSD": 245000000000,
                "autonomyNarrative": "Planetary capital routing under guardian veto.",
                "active": True,
            },
        ],
        "sentinels": [
            {
                "slug": "solar-guardian",
                "name": "Solar Guardian",
                "uri": "ipfs://phase8/sentinels/solar-guardian.json",
                "agent": "0x9999AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                "coverageSeconds": 900,
                "sensitivityBps": 420,
                "domains": ["climate-array"],
                "active": True,
            }
        ],
        "capitalStreams": [
            {
                "slug": "planetary-fund",
                "name": "Planetary Fund",
                "uri": "ipfs://phase8/streams/planetary-fund.json",
                "vault": "0xABABABABABABABABABABABABABABABABABABABAB",
                "annualBudget": 720000000000,
                "expansionBps": 1250,
                "domains": ["climate-array", "planetary-finance"],
                "active": True,
            }
        ],
        "selfImprovement": {
            "autonomyGuards": {
                "maxAutonomyBps": 8000,
                "humanOverrideMinutes": 15,
                "escalationChannels": ["Guardian Council"],
            }
        },
    }


@pytest.fixture()
def runtime(manifest_payload: dict) -> Phase8DominionRuntime:
    return Phase8DominionRuntime.from_payload(manifest_payload, source=Path("phase8.json"))


def make_step(*, tags: list[str] | None = None, domain: str | None = None) -> Step:
    payload = {
        "id": "step-1",
        "name": "Test dominion routing",
        "kind": "plan",
        "params": {},
        "needs": [],
    }
    if tags:
        payload["params"]["tags"] = tags
    if domain:
        payload["params"]["domain"] = domain
    return Step.model_validate(payload)


def test_runtime_selects_domain_via_tags(runtime: Phase8DominionRuntime) -> None:
    step = make_step(tags=["Climate", "Energy"])
    logs = runtime.annotate_step(step)
    assert logs and "`climate-array`" in logs[0]
    assert any("Solar Guardian" in line for line in logs)
    assert any("capital streams" in line and "Planetary Fund" in line for line in logs)
    assert any("guardian summary" in line and "treasury=0x1111" in line for line in logs)
    assert any("governance: autonomy cap" in line for line in logs)


def test_runtime_honours_domain_hint(runtime: Phase8DominionRuntime) -> None:
    step = make_step(domain="planetary-finance", tags=["logistics"])
    logs = runtime.annotate_step(step)
    assert logs and "`planetary-finance`" in logs[0]
    assert any("domain hint" in line for line in logs)
    assert any("sentinel coverage: none" in line.lower() for line in logs)
    assert any("governance: autonomy cap" in line for line in logs)
    assert any("guardrail alert" in line for line in logs)


def test_runtime_reports_unknown_domain(runtime: Phase8DominionRuntime) -> None:
    bogus_step = make_step(domain="unknown-dominion")
    logs = runtime.annotate_step(bogus_step)
    assert logs and "not found" in logs[0]
    assert any("falling back" in line for line in logs)


def test_runtime_loads_from_file(tmp_path: Path, manifest_payload: dict) -> None:
    config_path = tmp_path / "phase8.json"
    config_path.write_text(json.dumps(manifest_payload), encoding="utf-8")
    loaded = load_phase8_runtime(config_path)
    assert loaded.source == config_path
    step = make_step(tags=["finance"])
    logs = loaded.annotate_step(step)
    assert logs and "`planetary-finance`" in logs[0]


def test_runtime_flags_guardrails(runtime: Phase8DominionRuntime, manifest_payload: dict) -> None:
    stressed_payload = json.loads(json.dumps(manifest_payload))
    stressed_payload["domains"][0]["resilienceIndex"] = 0.4
    stressed_payload["domains"][0]["heartbeatSeconds"] = stressed_payload["global"]["heartbeatSeconds"] + 300
    stressed_payload["sentinels"][0]["coverageSeconds"] = 60
    stressed_payload["selfImprovement"]["autonomyGuards"]["maxAutonomyBps"] = 5000
    stressed_runtime = Phase8DominionRuntime.from_payload(stressed_payload)

    step = make_step(tags=["Climate"])
    logs = stressed_runtime.annotate_step(step)
    assert any("resilience alert" in line for line in logs)
    assert any("heartbeat alert" in line for line in logs)
    assert any("guardrail alert" in line for line in logs)
