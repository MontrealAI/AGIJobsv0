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
            "credentials": {
                "trustAnchors": [
                    {
                        "name": "Oversight Council",
                        "did": "did:ens:agi.jobs.council",
                        "role": "Emergency pause escalation",
                        "policyURI": "ipfs://policies/oversight.json",
                    }
                ],
                "issuers": [
                    {
                        "name": "Identity Bureau",
                        "did": "did:key:z6Mkissuer",
                        "attestationType": "AGIJobsEmploymentCredential",
                        "registry": "did:ethr:0x1234",
                        "domains": ["finance", "health"],
                    }
                ],
                "policies": [
                    {
                        "name": "Baseline Compliance",
                        "description": "Ensures verifiers validate DID signatures",
                        "uri": "ipfs://policies/compliance.md",
                    }
                ],
                "revocationRegistry": "did:pkh:eip155:1:0xabcd",
            },
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
                "credentials": [
                    {
                        "name": "Treasury Operations Clearance",
                        "requirement": "Required for settlements above $10M",
                        "credentialType": "BaselIII",
                        "format": "JSON-LD",
                        "issuers": ["did:ens:agi.jobs.council"],
                        "verifiers": ["did:ens:agi.jobs.finance.verifier"],
                        "registry": "did:ethr:0x1234",
                        "evidence": "ipfs://credentials/finance/treasury.pdf",
                    }
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
    assert any("trust anchors" in line.lower() for line in logs)
    assert any("credential guard rails" in line.lower() for line in logs)
    assert runtime.global_infrastructure[0]["name"] == "EigenLayer Risk Shield"
    bridge_plan = runtime.build_bridge_plan("finance")
    assert bridge_plan["domain"] == "finance"
    assert bridge_plan["l2Gateway"].lower().endswith("3333")
    assert bridge_plan["iotOracle"].lower().endswith("4444")
    assert bridge_plan["syncCadenceSeconds"] == pytest.approx(180)
    assert bridge_plan["infrastructure"]
    assert bridge_plan["infrastructure"][0]["layer"] == "Layer-2"
    assert bridge_plan["globalInfrastructure"]
    assert bridge_plan["credentials"]
    assert bridge_plan["credentials"][0]["name"] == "Treasury Operations Clearance"


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


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("slug", None),
        ("slug", "finance/../../health"),
        ("slug", "Finance"),
        ("slug", "financial_ops"),
        ("name", {"spoof": "name"}),
        ("manifestURI", None),
        ("manifestURI", "ipfs://finance\nspoofed-log"),
        ("heartbeatSeconds", 0),
        ("heartbeatSeconds", -1),
        ("heartbeatSeconds", 1.5),
        ("heartbeatSeconds", True),
        ("heartbeatSeconds", 2**64),
        ("priority", float("nan")),
        ("priority", float("inf")),
        ("priority", "95"),
        ("skillTags", "finance"),
        ("skillTags", ["finance", 1]),
        ("capabilities", []),
        ("capabilities", {"credit": float("inf")}),
        ("capabilities", {"credit": -1}),
        ("capabilities", {"credit": True}),
        ("capabilities", {"Credit": 1, "credit": 2}),
        ("l2Gateway", "not-an-address"),
        ("oracle", "0x" + "g" * 40),
        ("executionRouter", False),
        ("operations", []),
        ("telemetry", False),
        ("metadata", []),
        ("active", "false"),
        ("credentials", [{"name": "Credential", "issuers": "did:key:issuer"}]),
        ("credentials", [{}]),
    ],
)
def test_invalid_domain_configuration_fails_closed(sample_payload, field, value):
    sample_payload["domains"][0][field] = value
    with pytest.raises(ValueError):
        DomainExpansionRuntime.from_payload(sample_payload)


@pytest.mark.parametrize(
    ("section", "field", "value"),
    [
        ("operations", "requiresHumanValidation", "false"),
        ("operations", "requiresHumanValidation", 0),
        ("operations", "maxActiveJobs", -1),
        ("operations", "maxQueueDepth", 2**48),
        ("operations", "minStake", "1e18"),
        ("operations", "minStake", -1),
        ("operations", "minStake", str(2**96)),
        ("operations", "treasuryShareBps", 10001),
        ("operations", "circuitBreakerBps", 1.9),
        ("telemetry", "resilienceBps", -1),
        ("telemetry", "automationBps", 10001),
        ("telemetry", "complianceBps", "9900"),
        ("telemetry", "usesL2Settlement", "false"),
        ("telemetry", "settlementLatencySeconds", float("nan")),
        ("telemetry", "settlementLatencySeconds", 2**32),
        ("telemetry", "metricsDigest", "0x" + "z" * 64),
        ("telemetry", "manifestHash", "0x1234"),
        ("metadata", "resilienceIndex", 1.01),
        ("metadata", "valueFlowMonthlyUSD", float("inf")),
    ],
)
def test_invalid_domain_limits_and_flags_fail_closed(sample_payload, section, field, value):
    sample_payload["domains"][0].setdefault(section, {})[field] = value
    with pytest.raises(ValueError):
        DomainExpansionRuntime.from_payload(sample_payload)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("l2SyncCadence", 29),
        ("guards", {"autoPauseEnabled": "false"}),
        ("guards", {"treasuryBufferBps": 10001}),
        ("guards", {"anomalyGracePeriod": -1}),
        ("telemetry", {"resilienceFloorBps": 10001}),
        ("credentials", []),
        ("credentials", {"trustAnchors": "did:key:issuer"}),
        ("credentials", {"trustAnchors": [{}]}),
        ("credentials", {"issuers": ["issuer"]}),
        ("credentials", {"issuers": [{"name": "Issuer", "did": "did:key:issuer", "domains": "finance"}]}),
        ("credentials", {"policies": [False]}),
        ("credentials", {"revocationRegistry": 123}),
    ],
)
def test_invalid_global_configuration_fails_closed(sample_payload, field, value):
    sample_payload["global"][field] = value
    with pytest.raises(ValueError):
        DomainExpansionRuntime.from_payload(sample_payload)


def test_duplicate_domains_cannot_overwrite_routing(sample_payload):
    sample_payload["domains"].append(dict(sample_payload["domains"][0]))
    with pytest.raises(ValueError, match="unique"):
        DomainExpansionRuntime.from_payload(sample_payload)


@pytest.mark.parametrize("payload", [[], None, "config"])
def test_configuration_requires_an_object(payload):
    with pytest.raises(ValueError, match="object"):
        DomainExpansionRuntime.from_payload(payload)


@pytest.mark.parametrize(
    "text",
    [
        '{"domains": [], "domains": []}',
        '{"global": {"guards": {"autoPauseEnabled": true, "autoPauseEnabled": false}}}',
        '{"ignored": NaN}',
        '{"ignored": Infinity}',
    ],
)
def test_json_rejects_duplicate_keys_and_non_finite_values(tmp_path, text):
    path = tmp_path / "invalid.json"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(ValueError):
        DomainExpansionRuntime.from_file(path)


def test_missing_configuration_override_never_disables_runtime(tmp_path, monkeypatch):
    path = tmp_path / "missing.json"
    with pytest.raises(FileNotFoundError):
        load_runtime(path)
    monkeypatch.setenv("PHASE6_DOMAIN_CONFIG", str(path))
    with pytest.raises(FileNotFoundError):
        load_runtime()


def test_default_configuration_is_independent_of_working_directory(tmp_path, monkeypatch):
    monkeypatch.delenv("PHASE6_DOMAIN_CONFIG", raising=False)
    monkeypatch.chdir(tmp_path)
    runtime = load_runtime()
    assert len(runtime.domains) == 5
    assert runtime.source.is_absolute()


def test_inactive_domain_is_not_a_routing_candidate(sample_payload):
    sample_payload["domains"][0]["active"] = False
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    assert "inactive" in runtime.annotate_step(make_step(params={"domain": "finance"}))[0]
    assert "no eligible" in runtime.annotate_step(make_step(params={"tags": ["credit"]}))[0]
    with pytest.raises(ValueError, match="inactive"):
        runtime.build_bridge_plan("finance")
    with pytest.raises(ValueError, match="eligible"):
        runtime.ingest_iot_signal({"domain": "finance"})


def test_priority_cannot_fabricate_an_unrelated_skill_match(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    logs = runtime.annotate_step(make_step(params={"tags": ["aerospace"]}))
    assert logs == ["Phase6 runtime: no eligible domain found for current step."]
    with pytest.raises(ValueError, match="eligible"):
        runtime.ingest_iot_signal({"tags": ["aerospace"]})


def test_iot_signal_returns_resolved_candidate_and_does_not_log_raw_payload(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    slug, logs = runtime.ingest_iot_signal({"tags": [" CREDIT "], "private": "sensitive-value"})
    assert slug == "finance"
    assert any("unverified" in line for line in logs)
    assert not any("sensitive-value" in line for line in logs)
    assert any("credit" in line for line in logs)
    with pytest.raises(ValueError, match="eligible"):
        runtime.ingest_iot_signal({"domain": "unknown", "tags": ["credit"]})
    with pytest.raises(ValueError, match="array"):
        runtime.ingest_iot_signal({"tags": "credit"})


def test_conflicting_hints_and_malformed_tags_fail_closed(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    with pytest.raises(ValueError, match="conflicting"):
        runtime.annotate_step(make_step(params={"domain": "finance", "targetDomain": "health"}))
    with pytest.raises(ValueError, match="array"):
        runtime.annotate_step(make_step(params={"tags": "credit"}))


def test_bridge_plan_is_not_authorization_or_settlement_evidence(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    plan = runtime.build_bridge_plan(" FINANCE ")
    assert plan["status"] == "planning-only"
    assert plan["authorizationVerified"] is False
    assert plan["credentialsVerified"] is False
    assert plan["settlementReady"] is False
    assert any("unverified" in line for line in runtime.annotate_step(make_step(params={"domain": "finance"})))


def test_callers_cannot_mutate_loaded_configuration(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    sample_payload["domains"][0]["infrastructure"][0]["name"] = "spoofed"
    runtime.domains[0].active = False
    runtime.global_infrastructure[0]["name"] = "spoofed"
    plan = runtime.build_bridge_plan("finance")
    plan["infrastructure"][0]["name"] = "spoofed"
    plan["credentials"][0]["issuers"].clear()
    fresh = runtime.build_bridge_plan("finance")
    assert fresh["infrastructure"][0]["name"] == "Linea"
    assert fresh["credentials"][0]["issuers"]
    assert fresh["globalInfrastructure"][0]["name"] == "EigenLayer Risk Shield"


def test_zero_addresses_and_digests_mean_unconfigured_not_verified(sample_payload):
    domain = sample_payload["domains"][0]
    domain["executionRouter"] = "0x" + "0" * 40
    domain["telemetry"] = {"metricsDigest": "0x" + "0" * 64}
    plan = DomainExpansionRuntime.from_payload(sample_payload).build_bridge_plan("finance")
    assert plan["executionRouter"] is None
    assert plan["telemetry"]["metricsDigest"] is None
    assert plan["settlementReady"] is False


def test_minimum_stake_keeps_exact_base_units_without_assuming_eth(sample_payload):
    stake = "750000000000000000001"
    sample_payload["domains"][0]["operations"] = {"minStake": stake}
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    assert runtime.build_bridge_plan("finance")["minStake"] == stake
    summary = runtime.domains[0].operations_summary()
    assert stake in summary
    assert "ETH" not in summary


@pytest.mark.parametrize("lifecycle", ["sunset", "experimental"])
def test_only_commissioned_active_lifecycle_can_be_selected(sample_payload, lifecycle):
    sample_payload["domains"][0].update(active=True, lifecycle=lifecycle)
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    assert "not commissioned" in runtime.annotate_step(make_step(params={"domain": "finance"}))[0]
    assert "no eligible" in runtime.annotate_step(make_step(params={"tags": ["credit"]}))[0]
    with pytest.raises(ValueError, match="not commissioned"):
        runtime.build_bridge_plan("finance")
    with pytest.raises(ValueError, match="eligible"):
        runtime.ingest_iot_signal({"domain": "finance"})


@pytest.mark.parametrize("lifecycle", ["retired", "ACTIVE", None, True])
def test_invalid_lifecycle_is_rejected(sample_payload, lifecycle):
    sample_payload["domains"][0]["lifecycle"] = lifecycle
    with pytest.raises(ValueError, match="lifecycle"):
        DomainExpansionRuntime.from_payload(sample_payload)


def test_heartbeat_and_global_cadence_match_contract_boundaries(sample_payload):
    sample_payload["domains"][0]["heartbeatSeconds"] = 29
    with pytest.raises(ValueError, match="heartbeatSeconds"):
        DomainExpansionRuntime.from_payload(sample_payload)
    sample_payload["domains"][0]["heartbeatSeconds"] = 30
    sample_payload["global"]["l2SyncCadence"] = 0
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    assert runtime.build_bridge_plan("finance")["syncCadenceSeconds"] == 30
    assert any("heartbeat: 30s" in line for line in runtime.annotate_step(make_step(params={"domain": "finance"})))
    sample_payload["global"]["l2SyncCadence"] = 30
    assert DomainExpansionRuntime.from_payload(sample_payload).build_bridge_plan("finance")["syncCadenceSeconds"] == 30


@pytest.mark.parametrize(
    "requirements",
    [
        {"requiredSkills": ["credit", "clinical"]},
        {"requiredCapabilities": {"credit": 4}},
        {"requiredCapabilities": {"surgery": 1}},
        {"metadata": {"requiresHumanInLoop": True}},
        {"requiresHumanInLoop": True},
    ],
)
def test_explicit_domain_cannot_override_hard_requirements(sample_payload, requirements):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    params = {"domain": "finance", **requirements}
    assert "missing required capabilities" in runtime.annotate_step(make_step(params=params))[0]
    with pytest.raises(ValueError, match="eligible"):
        runtime.ingest_iot_signal(params)


def test_matching_hard_requirements_produce_only_a_candidate(sample_payload):
    sample_payload["domains"][0]["operations"] = {"requiresHumanValidation": True}
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    requirements = {
        "requiredSkills": [" CREDIT "],
        "requiredCapabilities": {" CREDIT ": 3},
        "metadata": {"requiresHumanInLoop": True},
    }
    logs = runtime.annotate_step(make_step(params=requirements))
    assert "candidate `finance`" in logs[0]
    assert any("unverified" in line for line in logs)
    assert runtime.ingest_iot_signal(requirements)[0] == "finance"


@pytest.mark.parametrize(
    "requirements",
    [
        {"requiredSkills": "credit"},
        {"requiredCapabilities": {"credit": 0}},
        {"requiredCapabilities": {"credit": "3"}},
        {"requiredCapabilities": {"credit": float("inf")}},
        {"requiredCapabilities": {"Credit": 1, "credit": 2}},
        {"metadata": {"requiresHumanInLoop": "false"}},
        {"requiresHumanInLoop": "false"},
    ],
)
def test_malformed_requirements_are_not_silently_ignored(sample_payload, requirements):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    with pytest.raises(ValueError):
        runtime.annotate_step(make_step(params=requirements))
    with pytest.raises(ValueError):
        runtime.ingest_iot_signal(requirements)


def test_unspecified_work_does_not_route_by_priority_alone(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    assert "no eligible" in runtime.annotate_step(make_step())[0]
    with pytest.raises(ValueError, match="eligible"):
        runtime.ingest_iot_signal({})


@pytest.mark.parametrize(
    ("path", "typo"),
    [
        ([], "domain"),
        (["domains", 0], "activee"),
        (["domains", 0, "operations"], "requiresHumanValidaton"),
        (["domains", 0, "telemetry"], "usesL2Settlment"),
        (["domains", 0, "infrastructureControl"], "autopilotEnabed"),
        (["domains", 0, "sunsetPlan"], "handoffDomain"),
        (["global"], "gaurds"),
        (["global", "guards"], "autoPauseEnabed"),
        (["global", "telemetry"], "resilienceFloorBp"),
        (["global", "infrastructure"], "enforceDecentralizedInfa"),
        (["global", "credentials"], "trustAnchor"),
    ],
)
def test_unknown_configuration_fields_fail_closed(sample_payload, path, typo):
    record = sample_payload
    for key in path:
        record = record[key] if isinstance(record, list) else record.setdefault(key, {})
    record[typo] = False
    with pytest.raises(ValueError, match="unsupported configuration fields"):
        DomainExpansionRuntime.from_payload(sample_payload)


@pytest.mark.parametrize(
    "control",
    [
        {"controlPlaneURI": "ipfs://control", "autopilotEnabled": "false"},
        {"controlPlaneURI": "ipfs://control", "autopilotEnabled": True, "autopilotCadence": 0},
        {"controlPlaneURI": "ipfs://control", "autopilotCadence": 29},
        {"controlPlaneURI": "ipfs://control", "agentOps": "invalid-address"},
    ],
)
def test_infrastructure_controls_are_validated_even_when_not_executed(sample_payload, control):
    sample_payload["domains"][0]["infrastructureControl"] = control
    with pytest.raises(ValueError):
        DomainExpansionRuntime.from_payload(sample_payload)


def test_declared_scenario_and_freeform_metadata_remain_supported(sample_payload):
    sample_payload["scenario"] = {"mode": "illustrative", "description": "Offline planning fixture."}
    sample_payload["domains"][0]["metadata"] = {"customOperatorNotes": {"department": "finance"}}
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    assert runtime.domains[0].metadata["customOperatorNotes"]["department"] == "finance"


def test_domain_hint_alias_cannot_bypass_an_explicit_target(sample_payload):
    runtime = DomainExpansionRuntime.from_payload(sample_payload)
    assert runtime.ingest_iot_signal({"domainHint": "health"})[0] == "health"
    with pytest.raises(ValueError, match="conflicting"):
        runtime.ingest_iot_signal({"domain": "finance", "domainHint": "health"})


@pytest.mark.parametrize("field", ["systemPause", "escalationBridge"])
def test_explicit_global_emergency_controls_must_be_nonzero(sample_payload, field):
    sample_payload["global"][field] = "0x" + "0" * 40
    with pytest.raises(ValueError, match="non-zero"):
        DomainExpansionRuntime.from_payload(sample_payload)


def test_explicit_validation_module_must_be_nonzero(sample_payload):
    sample_payload["domains"][0]["validationModule"] = "0x" + "0" * 40
    with pytest.raises(ValueError, match="non-zero"):
        DomainExpansionRuntime.from_payload(sample_payload)
