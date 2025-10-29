from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from textwrap import dedent
from typing import Any, Dict, Iterable, List, Mapping, Sequence

from meta_agentic_alpha_demo import DemoConfiguration, DemoOutcome, load_configuration, run_demo
from meta_agentic_alpha_v10.mission import OwnerSupremacyMandate, validate_owner_supremacy

DEMO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = DEMO_ROOT / "meta_agentic_alpha_v11"
DEFAULT_CONFIG_PATH = PACKAGE_ROOT / "config" / "scenario.yaml"
SUMMARY_FILENAME = "latest_run_v11.json"


@dataclass(frozen=True)
class OwnerSingularityMandate:
    """Owner empowerment profile for the V11 Hypergrid demo."""

    supremacy: OwnerSupremacyMandate
    identify_streams: Sequence[Mapping[str, Any]]
    anomaly_detectors: Sequence[str]
    watchers: Sequence[str]
    knowledge_nodes: Sequence[Mapping[str, Any]]
    knowledge_links: Sequence[Mapping[str, Any]]
    curricula: Sequence[str]
    world_model_channels: Sequence[str]
    reasoning_protocols: Sequence[str]
    design_protocols: Sequence[str]
    strategy_programs: Sequence[str]
    antifragility_loops: Sequence[str]
    execution_mesh: Sequence[Mapping[str, Any]]
    autopilot_controls: Mapping[str, Any]
    ci_checks: Sequence[str]
    external_tools: Sequence[str]
    owner_actions: Sequence[str]
    dataset_channels: Sequence[str]

    @property
    def guardians(self) -> Sequence[str]:
        return self.supremacy.guardians

    @property
    def guardian_failover(self) -> Sequence[str]:
        return self.supremacy.guardian_failover

    @property
    def approvals_required(self) -> int:
        return self.supremacy.approvals_required

    @property
    def emergency_pause(self) -> bool:
        return self.supremacy.emergency_pause

    @property
    def antifragility_buffer_percent(self) -> float:
        return self.supremacy.antifragility_buffer_percent

    @property
    def unstoppable_reserve_percent(self) -> float:
        return self.supremacy.unstoppable_reserve_percent

    @property
    def delegation_matrix(self) -> Mapping[str, Any]:
        return self.supremacy.delegation_matrix

    @property
    def circuit_breaker_window_minutes(self) -> int:
        return self.supremacy.circuit_breaker_window_minutes

    @property
    def session_keys(self) -> Sequence[str]:
        return self.supremacy.session_keys

    @property
    def bundler(self) -> str:
        return self.supremacy.bundler

    @property
    def paymaster(self) -> str:
        return self.supremacy.paymaster

    @property
    def treasury_policy(self) -> Mapping[str, Any]:
        return self.supremacy.treasury_policy

    @property
    def control_scripts(self) -> Mapping[str, str]:
        return self.supremacy.control_scripts

    @property
    def mutable_parameters(self) -> Mapping[str, Any]:
        return self.supremacy.mutable_parameters

    @property
    def timelock_address(self) -> str:
        return self.supremacy.timelock_address

    @property
    def multisig_address(self) -> str:
        return self.supremacy.multisig_address

    @property
    def unstoppable_threshold(self) -> float:
        return self.supremacy.unstoppable_threshold

    @property
    def treasury_streams(self) -> Sequence[Mapping[str, Any]]:
        return self.supremacy.treasury_streams

    @property
    def mission_threads(self) -> Sequence[str]:
        return self.supremacy.mission_threads

    @property
    def sovereign_domains(self) -> Sequence[str]:
        return self.supremacy.sovereign_domains

    @property
    def supremacy_vectors(self) -> Sequence[str]:
        return self.supremacy.supremacy_vectors

    @property
    def telemetry_channels(self) -> Sequence[str]:
        return self.supremacy.telemetry_channels

    @property
    def autopilot_modes(self) -> Mapping[str, Any]:
        return self.supremacy.autopilot_modes

    @property
    def upgrade_scripts(self) -> Mapping[str, str]:
        return self.supremacy.upgrade_scripts

    @property
    def owner_prompts(self) -> Sequence[str]:
        return self.supremacy.owner_prompts

    @property
    def antifragility_programs(self) -> Sequence[str]:
        return self.supremacy.antifragility_programs

    @property
    def cross_chain_bridges(self) -> Sequence[str]:
        return self.supremacy.cross_chain_bridges

    @property
    def gasless_controls(self) -> Mapping[str, Any]:
        return self.supremacy.gasless_controls


@dataclass(frozen=True)
class MetaSingularityOutcome:
    """Composite artefacts produced by the V11 demo run."""

    base: DemoOutcome
    summary_path: Path
    dashboard_path: Path
    report_path: Path
    scoreboard_path: Path
    dashboard_payload: Dict[str, Any]
    command_matrix: OwnerSingularityMandate


def _require_iterable(values: Iterable[Any], name: str, minimum: int) -> List[str]:
    sequence = [str(item).strip() for item in values if str(item).strip()]
    if len(sequence) < minimum:
        raise ValueError(f"{name} must provide at least {minimum} entries")
    return sequence


def _require_mapping(mapping: Mapping[str, Any], name: str, minimum: int) -> Mapping[str, Any]:
    if not isinstance(mapping, Mapping) or len(mapping) < minimum:
        raise ValueError(f"{name} must define at least {minimum} entries")
    return mapping


def _normalise_streams(raw_streams: Iterable[Any], minimum: int) -> List[Dict[str, Any]]:
    streams: List[Dict[str, Any]] = []
    for entry in raw_streams:
        if not isinstance(entry, Mapping):
            raise ValueError("Each identify stream must be a mapping")
        identifier = str(entry.get("id", "")).strip()
        domain = str(entry.get("domain", "")).strip()
        source = str(entry.get("source", "")).strip()
        if not identifier or not domain or not source:
            raise ValueError("Identify streams must declare id, domain, and source")
        stream = {
            "id": identifier,
            "domain": domain,
            "source": source,
            "refresh_minutes": int(entry.get("refresh_minutes", 5)),
            "alpha_signal": float(entry.get("alpha_signal", 0.65)),
            "confidence": float(entry.get("confidence", 0.9)),
            "detectors": [str(det) for det in entry.get("detectors", [])],
            "notes": str(entry.get("notes", "")).strip(),
        }
        streams.append(stream)
    if len(streams) < minimum:
        raise ValueError(f"phases.identify.streams must include at least {minimum} entries")
    return streams


def _normalise_nodes(raw_nodes: Iterable[Any], minimum: int) -> List[Dict[str, Any]]:
    nodes: List[Dict[str, Any]] = []
    for entry in raw_nodes:
        if not isinstance(entry, Mapping):
            raise ValueError("Knowledge nodes must be mappings")
        node_id = str(entry.get("id", "")).strip()
        if not node_id:
            raise ValueError("Knowledge nodes must include an id")
        nodes.append(
            {
                "id": node_id,
                "label": str(entry.get("label", node_id)).strip(),
                "category": str(entry.get("category", "")),
                "signal": float(entry.get("signal", 0.0)),
                "confidence": float(entry.get("confidence", 0.0)),
            }
        )
    if len(nodes) < minimum:
        raise ValueError(f"knowledge.nodes must include at least {minimum} entries")
    return nodes


def _normalise_links(raw_links: Iterable[Any], minimum: int) -> List[Dict[str, Any]]:
    links: List[Dict[str, Any]] = []
    for entry in raw_links:
        if not isinstance(entry, Mapping):
            raise ValueError("Knowledge links must be mappings")
        source = str(entry.get("source", "")).strip()
        target = str(entry.get("target", "")).strip()
        if not source or not target:
            raise ValueError("Knowledge links must define source and target")
        links.append(
            {
                "source": source,
                "target": target,
                "relationship": str(entry.get("relationship", "related_to")),
                "weight": float(entry.get("weight", 0.5)),
            }
        )
    if len(links) < minimum:
        raise ValueError(f"knowledge.links must include at least {minimum} entries")
    return links


def _normalise_execution_mesh(raw_mesh: Iterable[Any], minimum: int) -> List[Dict[str, Any]]:
    mesh: List[Dict[str, Any]] = []
    for entry in raw_mesh:
        if not isinstance(entry, Mapping):
            raise ValueError("Execution mesh entries must be mappings")
        name = str(entry.get("name", "")).strip()
        action = str(entry.get("action", "")).strip()
        endpoint = str(entry.get("endpoint", "")).strip()
        if not name or not action or not endpoint:
            raise ValueError("Execution mesh entries require name, action, and endpoint")
        mesh.append(
            {
                "name": name,
                "action": action,
                "endpoint": endpoint,
                "dry_run": bool(entry.get("dry_run", True)),
                "guarded": bool(entry.get("guarded", True)),
            }
        )
    if len(mesh) < minimum:
        raise ValueError(f"phases.out_execute.mesh must include at least {minimum} entries")
    return mesh


def validate_owner_singularity(config: DemoConfiguration) -> OwnerSingularityMandate:
    """Validate that the scenario delivers hypergrid-grade owner control."""

    supremacy = validate_owner_supremacy(config)
    scenario = config.payload.get("scenario", {})
    phases = scenario.get("phases", {})

    identify = phases.get("identify", {})
    out_learn = phases.get("out_learn", {})
    out_think = phases.get("out_think", {})
    out_design = phases.get("out_design", {})
    out_strategise = phases.get("out_strategise", {})
    out_execute = phases.get("out_execute", {})

    identify_streams = _normalise_streams(identify.get("streams", []), minimum=6)
    anomaly_detectors = _require_iterable(identify.get("detectors", []), "phases.identify.detectors", 4)
    watchers = _require_iterable(identify.get("watchers", []), "phases.identify.watchers", 4)

    knowledge = scenario.get("knowledge", {})
    knowledge_nodes = _normalise_nodes(knowledge.get("nodes", []), minimum=6)
    knowledge_links = _normalise_links(knowledge.get("links", []), minimum=6)

    curricula = _require_iterable(out_learn.get("curricula", []), "phases.out_learn.curricula", 5)
    world_model_channels = _require_iterable(
        out_learn.get("simulation_channels", []), "phases.out_learn.simulation_channels", 4
    )

    reasoning_protocols = _require_iterable(
        out_think.get("reasoning_protocols", []), "phases.out_think.reasoning_protocols", 5
    )
    design_protocols = _require_iterable(out_design.get("studios", []), "phases.out_design.studios", 4)

    strategy_programs = _require_iterable(out_strategise.get("programs", []), "phases.out_strategise.programs", 5)
    antifragility_loops = _require_iterable(
        out_strategise.get("antifragility_loops", []), "phases.out_strategise.antifragility_loops", 3
    )

    execution_mesh = _normalise_execution_mesh(out_execute.get("mesh", []), minimum=6)

    autopilot_controls = _require_mapping(
        scenario.get("autopilot", {}).get("controls", {}), "autopilot.controls", 5
    )
    ci_checks = _require_iterable(scenario.get("ci", {}).get("checks", []), "ci.checks", 10)
    external_tools = _require_iterable(out_execute.get("tool_interfaces", []), "phases.out_execute.tool_interfaces", 4)
    owner_actions = _require_iterable(scenario.get("operations", {}).get("owner_actions", []), "operations.owner_actions", 4)
    dataset_channels = _require_iterable(scenario.get("dataset_channels", []), "scenario.dataset_channels", 5)

    return OwnerSingularityMandate(
        supremacy=supremacy,
        identify_streams=identify_streams,
        anomaly_detectors=anomaly_detectors,
        watchers=watchers,
        knowledge_nodes=knowledge_nodes,
        knowledge_links=knowledge_links,
        curricula=curricula,
        world_model_channels=world_model_channels,
        reasoning_protocols=reasoning_protocols,
        design_protocols=design_protocols,
        strategy_programs=strategy_programs,
        antifragility_loops=antifragility_loops,
        execution_mesh=execution_mesh,
        autopilot_controls=dict(autopilot_controls),
        ci_checks=ci_checks,
        external_tools=external_tools,
        owner_actions=owner_actions,
        dataset_channels=dataset_channels,
    )


def prepare_environment(demo_root: Path) -> Dict[str, Path]:
    """Prepare isolated directories and environment variables for the V11 run."""

    orchestrator_root = demo_root / "storage" / "orchestrator_v11"
    orchestrator_root.mkdir(parents=True, exist_ok=True)
    (orchestrator_root / "agents").mkdir(parents=True, exist_ok=True)
    (orchestrator_root / "runs").mkdir(parents=True, exist_ok=True)

    env_map: Dict[str, Path] = {
        "ORCHESTRATOR_SCOREBOARD_PATH": orchestrator_root / "scoreboard.json",
        "ORCHESTRATOR_CHECKPOINT_PATH": orchestrator_root / "checkpoint.json",
        "ORCHESTRATOR_CHECKPOINT_LEVELDB": orchestrator_root / "checkpoint.db",
        "ORCHESTRATOR_GOVERNANCE_PATH": orchestrator_root / "governance.json",
        "ORCHESTRATOR_STATE_DIR": orchestrator_root / "runs",
        "AGENT_REGISTRY_PATH": orchestrator_root / "agents" / "registry.json",
    }

    for key, value in env_map.items():
        os.environ[key] = str(value)

    os.environ["ORCHESTRATOR_BRIDGE_MODE"] = "python"
    return env_map


def _mermaid_knowledge_graph(nodes: Sequence[Mapping[str, Any]], links: Sequence[Mapping[str, Any]]) -> str:
    lines = ["graph TD"]
    for node in nodes:
        label = node["label"].replace("\n", " ")
        lines.append(f"  {node['id']}[{label}]:::node")
    for link in links:
        relation = link["relationship"].replace("\n", " ")
        lines.append(
            f"  {link['source']} --|{relation} ({link['weight']:.2f})|--> {link['target']}"
        )
    lines.append("  classDef node fill:#041a2f,stroke:#22d3ee,stroke-width:2px,color:#f8fafc;")
    return "\n".join(lines)


def _compute_metrics(command: OwnerSingularityMandate, ci_status: str) -> Dict[str, float]:
    owner_empowerment = min(
        1.0,
        0.82
        + 0.01 * len(command.guardians)
        + 0.01 * len(command.session_keys)
        + 0.01 * len(command.owner_actions)
        + 0.01 * len(command.telemetry_channels),
    )
    unstoppable_readiness = min(
        1.0,
        0.84
        + 0.02 * len(command.supremacy.unstoppable_initiatives)
        + 0.01 * len(command.execution_mesh)
        + 0.01 * len(command.autopilot_controls)
        + 0.01 * len(command.antifragility_programs),
    )
    alpha_signal_strength = min(
        1.0,
        0.74 + 0.02 * len(command.identify_streams) + 0.01 * len(command.anomaly_detectors)
    )
    world_model_maturity = min(
        1.0,
        0.70 + 0.02 * len(command.curricula) + 0.02 * len(command.world_model_channels)
    )
    planner_intelligence = min(
        1.0,
        0.72 + 0.02 * len(command.reasoning_protocols) + 0.01 * len(command.strategy_programs)
    )
    design_velocity = min(
        1.0,
        0.71 + 0.02 * len(command.design_protocols) + 0.01 * len(command.external_tools)
    )
    strategy_resilience = min(
        1.0,
        0.72 + 0.02 * len(command.strategy_programs) + 0.02 * len(command.antifragility_loops)
    )
    execution_certainty = min(
        1.0,
        0.73 + 0.02 * len(command.execution_mesh) + 0.01 * len(command.ci_checks)
    )
    meta_ci_health = min(
        1.0,
        0.78 + 0.02 * len(command.ci_checks) + (0.06 if ci_status == "green" else 0.02),
    )
    capital_flywheel_index = min(
        1.0,
        0.75
        + 0.02 * len(command.treasury_streams)
        + 0.01 * len(command.cross_chain_bridges)
        + 0.01 * len(command.telemetry_channels),
    )
    expansion_thrust = min(
        1.0,
        0.72 + 0.02 * len(command.sovereign_domains) + 0.01 * len(command.dataset_channels)
    )

    supremacy_index = round(
        (
            owner_empowerment
            + unstoppable_readiness
            + alpha_signal_strength
            + planner_intelligence
            + execution_certainty
        )
        / 5,
        4,
    )

    return {
        "owner_empowerment": owner_empowerment,
        "unstoppable_readiness": unstoppable_readiness,
        "alpha_signal_strength": alpha_signal_strength,
        "world_model_maturity": world_model_maturity,
        "planner_intelligence": planner_intelligence,
        "design_velocity": design_velocity,
        "strategy_resilience": strategy_resilience,
        "execution_certainty": execution_certainty,
        "meta_ci_health": meta_ci_health,
        "capital_flywheel_index": capital_flywheel_index,
        "expansion_thrust": expansion_thrust,
        "supremacy_index": supremacy_index,
    }


def generate_singularity_dashboard(
    package_root: Path,
    summary: Mapping[str, Any],
    command: OwnerSingularityMandate,
    payload: Mapping[str, Any],
) -> Dict[str, Any]:
    """Produce the Hypergrid dashboard payload."""

    scenario = payload.get("scenario", {})
    phases = scenario.get("phases", {})
    ci = scenario.get("ci", {})
    ci_status = str(ci.get("status", "green")).lower()
    knowledge = scenario.get("knowledge", {})

    metrics = _compute_metrics(command, ci_status)
    metrics.update(
        {
            "owner_command_latency_seconds": max(2, 10 - len(command.owner_actions)),
            "guardian_resilience": min(
                1.0,
                0.74 + 0.02 * len(command.guardians) + 0.01 * len(command.guardian_failover),
            ),
        }
    )

    mermaid_flow = dedent(
        """
        graph LR
          Identify((Identify — Hyper Signals)) --> OutLearn[Out-Learn — Simulation Forge]
          OutLearn --> OutThink[Out-Think — Meta-Agentic Tree Search]
          OutThink --> OutDesign[Out-Design — Creative Atlas]
          OutDesign --> OutStrategise[Out-Strategise — Portfolio Navigator]
          OutStrategise --> OutExecute[Out-Execute — Execution Mesh]
          OutExecute --> Treasury[Treasury Autopilot]
          Treasury --> Governance[Guardian Mesh]
          Governance --> Owner[Owner Override Console]
          Owner --> Identify
          Owner --> OutStrategise
          subgraph CI_V2[CI V2 Enforcement]
            Lint[Lint]
            Tests[Tests]
            Python[Python Suites]
            Foundry[Foundry]
            Coverage[Coverage]
          end
          OutExecute --> CI_V2
          CI_V2 --> Owner
        """
    ).strip()

    mermaid_sequence = dedent(
        """
        sequenceDiagram
          participant Owner as Owner
          participant Planner as Meta-Planner
          participant Guild as Specialist Agents
          participant Governance as Guardian Mesh
          participant Chain as AGI Jobs v0 (v2)
          Owner->>Planner: Publish Hypergrid mandate
          Planner->>Guild: Spawn identify/learn/think threads
          Guild->>Governance: Deliver risk + antifragility dossier
          Governance->>Chain: Approve unstoppable parameters
          Chain-->>Planner: Simulate execution + treasury flow
          Planner-->>Owner: Render control surface + receipts
          Owner->>Chain: Execute override / pause / redeploy
        """
    ).strip()

    mermaid_gantt = dedent(
        """
        gantt
          title Hypergrid Sprint Timeline
          dateFormat X
          axisFormat %s
          section Identify
            Multi-domain sweep    :done,    0, 1
            Anomaly triage        :active,  1, 1
          section Out-Learn
            Curriculum escalation :        2, 1
            MuZero world model    :        3, 2
          section Out-Think
            Tree search synthesis :        5, 1
            A2A coordination     :        6, 1
          section Out-Design
            Prototype drafting    :        7, 1
            Simulation feedback   :        8, 1
          section Out-Strategise
            Treasury rebalancing  :        9, 1
            Governance updates    :        10, 1
          section Out-Execute
            Dry-run envelope      :        11, 1
            On-chain commit       :        12, 1
            Owner confirmation    :        13, 1
        """
    ).strip()

    mermaid_journey = dedent(
        """
        journey
          title Owner Empowerment Path
          section Console
            Launch hypergrid CLI: 5: owner
            Review strategy slate: 5: owner
            Approve overrides: 5: owner
          section Agents
            Compile signal dossier: 5: agents
            Refine world models: 5: agents
            Stress-test plans: 5: agents
          section Governance
            Validate safeguards: 5: guardians
            Confirm unstoppable quorum: 5: guardians
            Stream telemetry: 4: guardians
        """
    ).strip()

    mermaid_state = dedent(
        """
        stateDiagram-v2
          [*] --> Identify
          Identify --> OutLearn
          OutLearn --> OutThink
          OutThink --> OutDesign
          OutDesign --> OutStrategise
          OutStrategise --> OutExecute
          OutExecute --> Review
          Review --> Identify: Opportunity refresh
          Review --> [*]
          Review --> Override: Owner control
          Override --> OutExecute: Parameter shift
        """
    ).strip()

    mermaid_radar = dedent(
        f"""
        %%{{init: {{'theme': 'dark'}} }}%%
        radarChart
          title Hypergrid Capability Radar
          axes Empowerment, Readiness, Signals, WorldModel, Planner, Execution
          dataset Hypergrid
            data {metrics['owner_empowerment']:.2f}, {metrics['unstoppable_readiness']:.2f}, {metrics['alpha_signal_strength']:.2f}, {metrics['world_model_maturity']:.2f}, {metrics['planner_intelligence']:.2f}, {metrics['execution_certainty']:.2f}
        """
    ).strip()

    mermaid_knowledge = _mermaid_knowledge_graph(command.knowledge_nodes, command.knowledge_links)

    mermaid_quadrant = dedent(
        """
        quadrantChart
          title Hypergrid Command Quadrant
          x-axis Automation <---> Human Oversight
          y-axis Passive <---> Proactive
          "Owner Override Mesh" : 0.35 : 0.95
          "Guardian Council" : -0.10 : 0.96
          "CI Enforcement" : 0.60 : 0.78
          "Alpha Factories" : 0.82 : 0.58
          "Simulation Forge" : 0.55 : 0.74
          "Execution Mesh" : 0.70 : 0.88
        """
    ).strip()

    dashboard = {
        "meta": {
            "runId": summary.get("runId"),
            "scenarioId": summary.get("scenarioId"),
            "state": summary.get("state"),
        },
        "metrics": metrics,
        "identify": {
            "streams": command.identify_streams,
            "detectors": command.anomaly_detectors,
            "watchers": command.watchers,
            "anomalies": phases.get("identify", {}).get("anomalies", []),
        },
        "knowledge_base": {
            "nodes": command.knowledge_nodes,
            "links": command.knowledge_links,
            "retention": knowledge.get("retention_policies", []),
        },
        "learn": {
            "curricula": command.curricula,
            "simulation_channels": command.world_model_channels,
            "world_models": phases.get("out_learn", {}).get("world_models", []),
        },
        "think": {
            "protocols": command.reasoning_protocols,
            "heuristics": phases.get("out_think", {}).get("search_heuristics", []),
            "meta_agents": phases.get("out_think", {}).get("meta_agents", []),
        },
        "design": {
            "studios": command.design_protocols,
            "prototypes": phases.get("out_design", {}).get("prototypes", []),
        },
        "strategise": {
            "programs": command.strategy_programs,
            "governance_hooks": phases.get("out_strategise", {}).get("governance_hooks", []),
            "antifragility_loops": command.antifragility_loops,
        },
        "execute": {
            "mesh": command.execution_mesh,
            "safeguards": phases.get("out_execute", {}).get("safeguards", []),
            "dry_run_tools": phases.get("out_execute", {}).get("dry_run_tools", []),
        },
        "tooling": {
            "external_tools": command.external_tools,
            "dataset_channels": command.dataset_channels,
        },
        "control_surface": {
            "guardian_quorum": len(command.guardians),
            "guardian_count": len(command.guardians),
            "failover_guardian_count": len(command.guardian_failover),
            "session_keys": list(command.session_keys),
            "unstoppable_threshold": command.unstoppable_threshold,
            "telemetry_channels": command.telemetry_channels,
            "autopilot_modes": command.autopilot_modes,
            "autopilot_controls": command.autopilot_controls,
            "owner_actions": command.owner_actions,
            "supremacy_vectors": command.supremacy_vectors,
            "mission_threads": command.mission_threads,
            "sovereign_domains": command.sovereign_domains,
            "gasless_controls": command.gasless_controls,
            "upgrade_scripts": command.upgrade_scripts,
            "mutable_parameters": command.mutable_parameters,
            "emergency_pause": command.emergency_pause,
            "circuit_breaker_minutes": command.circuit_breaker_window_minutes,
            "unstoppable_reserve_percent": command.unstoppable_reserve_percent,
            "antifragility_buffer_percent": command.antifragility_buffer_percent,
        },
        "ci_v2": {
            "status": ci_status,
            "checks": command.ci_checks,
            "gatekeepers": ci.get("gatekeepers", []),
            "response_minutes": ci.get("response_minutes", 4),
        },
        "mermaid": {
            "flow": mermaid_flow,
            "sequence": mermaid_sequence,
            "gantt": mermaid_gantt,
            "journey": mermaid_journey,
            "state": mermaid_state,
            "radar": mermaid_radar,
            "knowledge": mermaid_knowledge,
            "quadrant": mermaid_quadrant,
        },
    }

    ui_dir = package_root / "ui"
    ui_dir.mkdir(parents=True, exist_ok=True)
    path = ui_dir / "dashboard-data-v11.json"
    path.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2), encoding="utf-8")
    return dashboard


def generate_singularity_report(
    package_root: Path, summary: Mapping[str, Any], dashboard: Mapping[str, Any]
) -> Path:
    """Render the Hypergrid masterplan deck."""

    reports_dir = package_root / "reports" / "generated"
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / "alpha_meta_singularity_masterplan.md"

    report = dedent(
        f"""
        # Meta-Agentic α-AGI Jobs Demo V11 — Hypergrid Masterplan

        **Run ID:** {summary.get('runId', 'unknown')}  \\
        **Scenario:** {summary.get('scenarioId', 'meta-agentic-alpha-v11')}  \\
        **State:** {summary.get('state', 'unknown')}  \\
        **Owner Empowerment:** {dashboard['metrics']['owner_empowerment']*100:.2f}%  \\
        **Supremacy Index:** {dashboard['metrics']['supremacy_index']*100:.2f}%  \\
        **Unstoppable Readiness:** {dashboard['metrics']['unstoppable_readiness']*100:.2f}%

        ## Hypergrid Flow

        ```mermaid
        {dashboard['mermaid']['flow']}
        ```

        ## Capability Radar

        ```mermaid
        {dashboard['mermaid']['radar']}
        ```

        ## Knowledge Graph

        ```mermaid
        {dashboard['mermaid']['knowledge']}
        ```

        ## Guardian & Owner Sequence

        ```mermaid
        {dashboard['mermaid']['sequence']}
        ```

        ## Timeline

        ```mermaid
        {dashboard['mermaid']['gantt']}
        ```

        ## Owner Journey

        ```mermaid
        {dashboard['mermaid']['journey']}
        ```

        ## Hypergrid State Machine

        ```mermaid
        {dashboard['mermaid']['state']}
        ```

        ## Command Quadrant

        ```mermaid
        {dashboard['mermaid']['quadrant']}
        ```

        ## Identify — Opportunity Mesh

        ```json
        {json.dumps(dashboard['identify'], indent=2)}
        ```

        ## Knowledge — Opportunity Graph

        ```json
        {json.dumps(dashboard['knowledge_base'], indent=2)}
        ```

        ## Learn / Think / Design / Strategise / Execute

        ```json
        {json.dumps(
            {
                "learn": dashboard['learn'],
                "think": dashboard['think'],
                "design": dashboard['design'],
                "strategise": dashboard['strategise'],
                "execute": dashboard['execute'],
            },
            indent=2,
        )}
        ```

        ## CI V2 & Control Surface

        ```json
        {json.dumps(
            {
                "ci_v2": dashboard['ci_v2'],
                "control_surface": dashboard['control_surface'],
            },
            indent=2,
        )}
        ```
        """
    ).strip()

    path.write_text(report + "\n", encoding="utf-8")
    return path


def _build_summary_payload(
    config: DemoConfiguration, command: OwnerSingularityMandate, outcome: DemoOutcome
) -> Dict[str, Any]:
    scenario = config.payload.get("scenario", {})
    phases = scenario.get("phases", {})

    scenario_id = scenario.get("id")
    if not scenario_id and hasattr(outcome.plan, "metadata"):
        scenario_id = outcome.plan.metadata.get("scenario")
    summary = {
        "runId": outcome.run_id,
        "state": outcome.status.run.state,
        "scenarioId": scenario_id,
        "owner": {
            "address": scenario.get("owner", {}).get("address"),
            "timelock": command.timelock_address,
            "multisig": command.multisig_address,
            "guardians": list(command.guardians),
            "guardian_failover": list(command.guardian_failover),
            "unstoppable_threshold": command.unstoppable_threshold,
            "session_keys": list(command.session_keys),
            "autopilot_controls": command.autopilot_controls,
            "owner_actions": command.owner_actions,
        },
        "ciV2": {
            "status": scenario.get("ci", {}).get("status", "green"),
            "checks": command.ci_checks,
            "gatekeepers": scenario.get("ci", {}).get("gatekeepers", []),
        },
        "phases": {
            "identify": phases.get("identify", {}),
            "out_learn": phases.get("out_learn", {}),
            "out_think": phases.get("out_think", {}),
            "out_design": phases.get("out_design", {}),
            "out_strategise": phases.get("out_strategise", {}),
            "out_execute": phases.get("out_execute", {}),
        },
        "agents": config.demo.get("agents", []),
        "unstoppable_initiatives": command.supremacy.unstoppable_initiatives,
        "telemetry_channels": command.telemetry_channels,
        "sovereign_domains": command.sovereign_domains,
        "mission_threads": command.mission_threads,
        "scoreboard": outcome.scoreboard_snapshot,
    }
    return summary


def run_meta_singularity_demo(
    config_path: str | Path | None = None, *, timeout: float = 300.0
) -> MetaSingularityOutcome:
    """Execute the V11 Hypergrid demonstration end-to-end."""

    config = load_configuration(config_path or DEFAULT_CONFIG_PATH)
    demo_root = config.base_dir.parent
    prepare_environment(demo_root)
    command = validate_owner_singularity(config)

    outcome = run_demo(config, timeout=timeout)
    summary_payload = _build_summary_payload(config, command, outcome)

    summary_path = demo_root / "storage" / SUMMARY_FILENAME
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    scoreboard_path = Path(os.environ["ORCHESTRATOR_SCOREBOARD_PATH"])
    scoreboard_path.parent.mkdir(parents=True, exist_ok=True)
    scoreboard_path.write_text(
        json.dumps(outcome.scoreboard_snapshot, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    dashboard_payload = generate_singularity_dashboard(
        PACKAGE_ROOT, summary_payload, command, config.payload
    )
    report_path = generate_singularity_report(PACKAGE_ROOT, summary_payload, dashboard_payload)

    return MetaSingularityOutcome(
        base=outcome,
        summary_path=summary_path,
        dashboard_path=PACKAGE_ROOT / "ui" / "dashboard-data-v11.json",
        report_path=report_path,
        scoreboard_path=scoreboard_path,
        dashboard_payload=dashboard_payload,
        command_matrix=command,
    )


__all__ = [
    "DEFAULT_CONFIG_PATH",
    "OwnerSingularityMandate",
    "MetaSingularityOutcome",
    "prepare_environment",
    "validate_owner_singularity",
    "generate_singularity_dashboard",
    "generate_singularity_report",
    "run_meta_singularity_demo",
]
