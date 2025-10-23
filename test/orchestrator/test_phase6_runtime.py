from pathlib import Path

import pytest

from orchestrator.extensions import DomainExpansionRuntime, load_runtime
from orchestrator.models import Step


@pytest.fixture()
def sample_payload():
    return {
        "global": {
            "iotOracleRouter": "0x1111111111111111111111111111111111111111",
            "defaultL2Gateway": "0x2222222222222222222222222222222222222222",
            "manifestURI": "ipfs://phase6/global.json",
            "l2SyncCadence": 180,
            "decentralizedInfra": [
                {
                    "name": "EigenLayer Risk Shield",
                    "role": "Cross-domain resilience scoring",
                    "status": "active",
                    "layer": "Security",
                    "endpoint": "https://mesh.agi.jobs/eigenlayer",
                },
                {
                    "name": "Filecoin Saturn Mesh",
                    "role": "Distributed compute fabric",
                    "status": "ready",
                    "endpoint": "https://mesh.agi.jobs/saturn",
                },
            ],
        },
        "domains": [
            {
                "slug": "finance",
                "name": "Global Finance Swarm",
                "manifestURI": "ipfs://phase6/finance.json",
                "subgraph": "https://phase6.montreal.ai/subgraphs/finance",
                "l2Gateway": "0x3333333333333333333333333333333333333333",
                "oracle": "0x4444444444444444444444444444444444444444",
                "executionRouter": "0x5555555555555555555555555555555555555555",
                "heartbeatSeconds": 90,
                "skillTags": ["finance", "risk", "credit"],
                "capabilities": {"credit": 3.0},
                "priority": 50,
                "infrastructure": [
                    {
                        "layer": "Layer-2",
                        "name": "Linea",
                        "role": "High frequency settlements",
                        "status": "active",
                        "endpoint": "https://linea.build",
                    },
                    {
                        "layer": "Storage",
                        "name": "Arweave",
                        "role": "Portfolio manifest archive",
                        "status": "active",
                    },
                ],
            },
            {
                "slug": "health",
                "name": "Healthcare Diagnostics Grid",
                "manifestURI": "ipfs://phase6/health.json",
                "subgraph": "https://phase6.montreal.ai/subgraphs/health",
                "heartbeatSeconds": 150,
                "skillTags": ["healthcare", "compliance"],
                "priority": 40,
                "infrastructure": [
                    {
                        "layer": "Layer-2",
                        "name": "Arbitrum",
                        "role": "Clinical coordination",
                        "status": "active",
                    }
                ],
            },
        ],
    }


def make_step(**overrides):
    base = {
        "id": "step-1",
        "name": "Post domain aware job",
        "kind": "plan",
        "tool": "job.post",
        "params": {},
        "needs": [],
    }
    base.update(overrides)
    return Step.model_validate(base)


def test_runtime_selects_domain_and_builds_bridge(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    step = make_step(params={"tags": ["credit", "analysis"]})
    logs = runtime.annotate_step(step)
    assert any("finance" in line for line in logs)
    assert any("infra mesh" in line for line in logs)
    assert runtime.global_infrastructure[0]["name"] == "EigenLayer Risk Shield"
    bridge_plan = runtime.build_bridge_plan("finance")
    assert bridge_plan["domain"] == "finance"
    assert bridge_plan["l2Gateway"].lower().endswith("3333")
    assert bridge_plan["iotOracle"].lower().endswith("4444")
    assert bridge_plan["syncCadenceSeconds"] == pytest.approx(180)
    assert bridge_plan["infrastructure"]
    assert bridge_plan["infrastructure"][0]["layer"] == "Layer-2"
    assert bridge_plan["globalInfrastructure"]


def test_runtime_hints_and_iot_signals(tmp_path: Path, sample_payload):
    config_path = tmp_path / "phase6.json"
    config_path.write_text("""
    {
      "global": {
        "manifestURI": "ipfs://phase6/global.json"
      },
      "domains": [
        {
          "slug": "logistics",
          "name": "Planetary Logistics",
          "manifestURI": "ipfs://phase6/logistics.json",
          "subgraph": "https://phase6.montreal.ai/subgraphs/logistics",
          "skillTags": ["logistics", "iot", "supply"],
          "priority": 55,
          "infrastructure": [
            {
              "layer": "Layer-2",
              "name": "Base",
              "role": "Logistics orchestration",
              "status": "active"
            }
          ]
        }
      ]
    }
    """, encoding="utf-8")

    runtime = load_runtime(config_path)
    step = make_step(params={"domain": "logistics", "tags": ["IoT"]})
    logs = runtime.annotate_step(step)
    assert any("logistics" in line for line in logs)

    slug, ingest_logs = runtime.ingest_iot_signal({"domain": "logistics", "tags": ["iot", "routing"]})
    assert slug == "logistics"
    assert any("matched" in line.lower() for line in ingest_logs)


def test_runtime_handles_unknown_domain(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    step = make_step(params={"domain": "unknown"})
    logs = runtime.annotate_step(step)
    assert logs and "not found" in logs[0]
