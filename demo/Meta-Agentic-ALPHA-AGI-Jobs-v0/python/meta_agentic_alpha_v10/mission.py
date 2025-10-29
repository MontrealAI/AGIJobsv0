"""Meta-Agentic α-AGI Jobs Demo V10 mission runtime."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from textwrap import dedent
from typing import Any, Dict, Iterable, Mapping, Sequence

from meta_agentic_alpha_demo import DemoConfiguration, DemoOutcome, load_configuration, run_demo
from meta_agentic_alpha_v9 import (
    OwnerSovereigntyMandate as SovereigntyMandateV9,
    generate_sovereignty_dashboard as generate_v9_dashboard,
    validate_owner_sovereignty as validate_v9_mandate,
)

DEMO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = DEMO_ROOT / "meta_agentic_alpha_v10"
DEFAULT_CONFIG_PATH = PACKAGE_ROOT / "config" / "scenario.yaml"


@dataclass(frozen=True)
class OwnerOmniSovereigntyMandate:
    """Validated omnidominion empowerment profile for the V10 demo."""

    base: SovereigntyMandateV9
    hyperstructure_vectors: Sequence[str]
    market_sentinels: Sequence[str]
    onchain_controls: Sequence[str]
    portfolio_modes: Sequence[str]
    simulation_envelopes: Sequence[str]
    owner_decisions: Sequence[str]
    ci_controls: Sequence[str]
    treasury_routes: Sequence[str]
    omni_switches: Mapping[str, str]
    command_protocols: Sequence[str]
    sovereign_ops: Sequence[str]
    supercluster_integrations: Sequence[str]
    unstoppable_target: float

    @property
    def guardians(self) -> Sequence[str]:
        return self.base.guardians

    @property
    def guardian_failover(self) -> Sequence[str]:
        return self.base.guardian_failover

    @property
    def approvals_required(self) -> int:
        return self.base.approvals_required

    @property
    def emergency_pause(self) -> bool:
        return self.base.emergency_pause

    @property
    def antifragility_buffer_percent(self) -> float:
        return self.base.antifragility_buffer_percent

    @property
    def unstoppable_reserve_percent(self) -> float:
        return self.base.unstoppable_reserve_percent

    @property
    def delegation_matrix(self) -> Mapping[str, Any]:
        return self.base.delegation_matrix

    @property
    def circuit_breaker_window_minutes(self) -> int:
        return self.base.circuit_breaker_window_minutes

    @property
    def session_keys(self) -> Sequence[str]:
        return self.base.session_keys

    @property
    def bundler(self) -> str:
        return self.base.bundler

    @property
    def paymaster(self) -> str:
        return self.base.paymaster

    @property
    def treasury_policy(self) -> Mapping[str, Any]:
        return self.base.treasury_policy

    @property
    def control_scripts(self) -> Mapping[str, str]:
        return self.base.control_scripts

    @property
    def mutable_parameters(self) -> Mapping[str, Any]:
        return self.base.mutable_parameters

    @property
    def timelock_address(self) -> str:
        return self.base.timelock_address

    @property
    def multisig_address(self) -> str:
        return self.base.multisig_address

    @property
    def guardian_count(self) -> int:
        return self.base.guardian_count

    @property
    def sovereign_domains(self) -> Sequence[str]:
        return self.base.sovereign_domains

    @property
    def mission_threads(self) -> Sequence[str]:
        return self.base.mission_threads

    @property
    def unstoppable_initiatives(self) -> Sequence[str]:
        return self.base.unstoppable_initiatives

    @property
    def telemetry_channels(self) -> Sequence[str]:
        return self.base.telemetry_channels

    @property
    def autopilot_modes(self) -> Mapping[str, Any]:
        return self.base.autopilot_modes

    @property
    def upgrade_scripts(self) -> Mapping[str, str]:
        return self.base.upgrade_scripts

    @property
    def ci_checks(self) -> Sequence[str]:
        return self.base.ci_checks

    @property
    def treasury_streams(self) -> Sequence[Mapping[str, Any]]:
        return self.base.treasury_streams

    @property
    def owner_prompts(self) -> Sequence[str]:
        return self.base.owner_prompts

    @property
    def unstoppable_switches(self) -> Mapping[str, Any]:
        return self.base.unstoppable_switches

    @property
    def unstoppable_threshold(self) -> float:
        return self.base.unstoppable_threshold


@dataclass(frozen=True)
class MetaOmniSovereigntyOutcome:
    """Composite artefacts produced by the V10 demo run."""

    base: DemoOutcome
    summary_path: Path
    dashboard_path: Path
    report_path: Path
    scoreboard_path: Path
    dashboard_payload: Dict[str, Any]
    mandate: OwnerOmniSovereigntyMandate


def _require_iterable(values: Iterable[Any], name: str, minimum: int) -> Sequence[str]:
    sequence = [str(item).strip() for item in values if str(item).strip()]
    if len(sequence) < minimum:
        raise ValueError(f"{name} must include at least {minimum} entries")
    return sequence


def _require_mapping(mapping: Mapping[str, Any], name: str, minimum: int) -> Mapping[str, str]:
    if not isinstance(mapping, Mapping) or len(mapping) < minimum:
        raise ValueError(f"{name} must define at least {minimum} entries")
    return {str(key): str(value) for key, value in mapping.items()}


def validate_owner_omni_mandate(config: DemoConfiguration) -> OwnerOmniSovereigntyMandate:
    """Validate that the V10 scenario grants omnidominion-level control."""

    base_mandate = validate_v9_mandate(config)
    payload = config.payload
    scenario = payload.get("scenario", {})
    omni = scenario.get("omni", {})
    operations = scenario.get("operations", {})
    ci = scenario.get("ci", {})
    treasury = scenario.get("treasury", {})

    hyperstructure_vectors = _require_iterable(
        omni.get("hyperstructure_vectors", []),
        "scenario.omni.hyperstructure_vectors",
        4,
    )
    market_sentinels = _require_iterable(
        omni.get("market_sentinels", []),
        "scenario.omni.market_sentinels",
        5,
    )
    command_protocols = _require_iterable(
        omni.get("command_protocols", []),
        "scenario.omni.command_protocols",
        4,
    )
    sovereign_ops = _require_iterable(
        omni.get("sovereign_ops", []),
        "scenario.omni.sovereign_ops",
        4,
    )
    supercluster_integrations = _require_iterable(
        omni.get("supercluster_integrations", []),
        "scenario.omni.supercluster_integrations",
        3,
    )
    onchain_controls = _require_iterable(
        operations.get("onchain_controls", []),
        "scenario.operations.onchain_controls",
        4,
    )
    portfolio_modes = _require_iterable(
        operations.get("portfolio_modes", []),
        "scenario.operations.portfolio_modes",
        4,
    )
    simulation_envelopes = _require_iterable(
        operations.get("simulation_envelopes", []),
        "scenario.operations.simulation_envelopes",
        3,
    )
    owner_decisions = _require_iterable(
        operations.get("owner_decisions", []),
        "scenario.operations.owner_decisions",
        4,
    )
    ci_controls = _require_iterable(ci.get("controls", []), "scenario.ci.controls", 3)
    treasury_routes = _require_iterable(
        treasury.get("liquidity_routes", []),
        "scenario.treasury.liquidity_routes",
        5,
    )
    omni_switches = _require_mapping(scenario.get("omni_switches", {}), "scenario.omni_switches", 3)

    unstoppable_target = float(omni.get("unstoppable_target", base_mandate.unstoppable_threshold))
    if unstoppable_target < 0.95:
        raise ValueError("scenario.omni.unstoppable_target must be at least 0.95")

    return OwnerOmniSovereigntyMandate(
        base=base_mandate,
        hyperstructure_vectors=hyperstructure_vectors,
        market_sentinels=market_sentinels,
        onchain_controls=onchain_controls,
        portfolio_modes=portfolio_modes,
        simulation_envelopes=simulation_envelopes,
        owner_decisions=owner_decisions,
        ci_controls=ci_controls,
        treasury_routes=treasury_routes,
        omni_switches=omni_switches,
        command_protocols=command_protocols,
        sovereign_ops=sovereign_ops,
        supercluster_integrations=supercluster_integrations,
        unstoppable_target=unstoppable_target,
    )


def prepare_environment(demo_root: Path) -> Dict[str, Path]:
    """Prepare storage directories and environment variables for V10 runs."""

    orchestrator_root = demo_root / "storage" / "orchestrator_v10"
    orchestrator_root.mkdir(parents=True, exist_ok=True)
    (orchestrator_root / "agents").mkdir(parents=True, exist_ok=True)
    (orchestrator_root / "runs").mkdir(parents=True, exist_ok=True)

    env_map = {
        "ORCHESTRATOR_BRIDGE_MODE": "python",
        "ORCHESTRATOR_SCOREBOARD_PATH": orchestrator_root / "scoreboard.json",
        "ORCHESTRATOR_CHECKPOINT_PATH": orchestrator_root / "checkpoint.json",
        "ORCHESTRATOR_CHECKPOINT_LEVELDB": orchestrator_root / "checkpoint.db",
        "ORCHESTRATOR_GOVERNANCE_PATH": orchestrator_root / "governance.json",
        "ORCHESTRATOR_STATE_DIR": orchestrator_root / "runs",
        "AGENT_REGISTRY_PATH": orchestrator_root / "agents" / "registry.json",
    }
    for key, value in env_map.items():
        os.environ[key] = str(value)
    return env_map


def _load_json(path: Path) -> Dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected mapping payload at {path}")
    return payload


def _compute_score(value: float) -> float:
    return max(0.0, min(1.0, value))


def generate_omni_dashboard(
    package_root: Path,
    summary: Dict[str, Any],
    scoreboard: Dict[str, Any],
    mandate: OwnerOmniSovereigntyMandate,
) -> Dict[str, Any]:
    """Generate the omnidominion sovereignty dashboard payload."""

    base_payload = generate_v9_dashboard(package_root, summary, scoreboard, mandate.base)

    data_root = package_root / "data"
    hyperstructure = _load_json(data_root / "hyperstructure_vectors.json")
    market = _load_json(data_root / "market_sentinels.json")
    execution = _load_json(data_root / "execution_matrix.json")
    ci_v2 = _load_json(data_root / "ci_v2.json")

    metrics = base_payload.setdefault("metrics", {})
    owner_empowerment = _compute_score(metrics.get("owner_empowerment", 0.0) + 0.05 + 0.02 * len(mandate.owner_decisions))
    sovereignty_index = _compute_score(
        0.68
        + 0.03 * len(mandate.hyperstructure_vectors)
        + 0.04 * len(mandate.sovereign_domains)
        + 0.03 * len(mandate.command_protocols)
    )
    unstoppable_readiness = _compute_score(
        max(metrics.get("unstoppable_readiness", 0.0), 0.82)
        + 0.05
        + 0.02 * len(mandate.onchain_controls)
        + 0.02 * len(mandate.market_sentinels)
    )
    autopilot_mastery = _compute_score(metrics.get("autopilot_mastery", 0.0) + 0.05 + 0.01 * len(mandate.portfolio_modes))
    meta_ci_health = _compute_score(
        metrics.get("meta_ci_health", 0.0) + 0.06 + (0.08 if ci_v2.get("status") == "hyper-green" else 0.05)
    )
    capital_flywheel_index = _compute_score(
        metrics.get("capital_flywheel_index", 0.0)
        + 0.05
        + 0.02 * len(mandate.treasury_streams)
        + 0.02 * len(mandate.treasury_routes)
    )
    guardian_resilience = _compute_score(
        metrics.get("guardian_resilience", 0.0)
        + 0.04 * len(mandate.guardian_failover)
        + 0.03 * len(mandate.market_sentinels)
    )
    superintelligence_yield = _compute_score(
        0.64
        + 0.03 * len(mandate.supercluster_integrations)
        + 0.04 * len(hyperstructure.get("vectors", []))
        + 0.03 * len(market.get("signals", []))
    )
    alpha_conversion = _compute_score(
        0.66
        + 0.04 * len(execution.get("alpha_routes", []))
        + 0.03 * len(market.get("sentinel_clusters", []))
    )

    metrics.update(
        {
            "owner_empowerment": owner_empowerment,
            "sovereignty_index": sovereignty_index,
            "unstoppable_readiness": max(unstoppable_readiness, mandate.unstoppable_target),
            "autopilot_mastery": autopilot_mastery,
            "meta_ci_health": meta_ci_health,
            "capital_flywheel_index": capital_flywheel_index,
            "guardian_resilience": guardian_resilience,
            "superintelligence_yield": superintelligence_yield,
            "alpha_conversion": alpha_conversion,
            "owner_command_latency_seconds": execution.get("owner_command_latency_seconds", 6),
            "owner_approval_speed_minutes": execution.get("owner_approval_speed_minutes", 1),
            "scoreboard": scoreboard,
        }
    )

    control_surface = base_payload.setdefault("control_surface", {})
    control_surface.update(
        {
            "hyperstructure_vectors": list(mandate.hyperstructure_vectors),
            "market_sentinels": list(mandate.market_sentinels),
            "onchain_controls": list(mandate.onchain_controls),
            "portfolio_modes": list(mandate.portfolio_modes),
            "simulation_envelopes": list(mandate.simulation_envelopes),
            "owner_decisions": list(mandate.owner_decisions),
            "ci_controls": list(mandate.ci_controls),
            "treasury_routes": list(mandate.treasury_routes),
            "omni_switches": dict(mandate.omni_switches),
            "command_protocols": list(mandate.command_protocols),
            "sovereign_ops": list(mandate.sovereign_ops),
            "supercluster_integrations": list(mandate.supercluster_integrations),
            "unstoppable_threshold": mandate.unstoppable_threshold,
            "guardian_quorum": mandate.guardian_count,
            "failover_guardian_count": len(mandate.guardian_failover),
        }
    )

    mermaid = base_payload.setdefault("mermaid", {})
    mermaid_flow = dedent(
        """
        graph TD
          Owner((Sovereign Owner)) --> Identify[Identify Mesh]
          Identify --> Learn[POET+MuZero World Forge]
          Learn --> Think[Meta-Agentic Planner]
          Think --> Design[Creative HyperForge]
          Design --> Strategise[Portfolio Navigator]
          Strategise --> Execute[On-Chain Execution Fabric]
          Execute --> Govern[Guardian Meta-Mesh]
          Govern --> Compound[Treasury Flywheel]
          Compound --> Owner
          Owner -->|Override Scripts| Execute
          Owner -->|Parameter Switches| Strategise
          subgraph Hyperstructure[Omni Hyperstructure]
            Telemetry((Telemetry))
            Autopilot((Autopilot))
            Treasury((Treasury))
            Guardians((Guardian Mesh))
            CI((CI V2 Grid))
            Sentinels((Market Sentinels))
            Telemetry --> Autopilot
            Autopilot --> Treasury
            Treasury --> Guardians
            Guardians --> CI
            CI --> Sentinels
            Sentinels --> Execute
          end
          Execute --> Hyperstructure
          Hyperstructure --> Execute
        """
    ).strip()

    mermaid_sequence = dedent(
        """
        sequenceDiagram
          participant Owner as Owner
          participant Console as Omni Console
          participant Planner as Meta-Planner
          participant Guardians as Guardian Mesh
          participant Chain as Ethereum + AGI Jobs v0 (v2)
          participant Treasury as Treasury Flywheel
          Owner->>Console: Select omni mission charter
          Console->>Planner: Submit omnidominion scenario YAML
          Planner->>Guardians: Request quorum + antifragility proofs
          Guardians-->>Planner: Threshold signatures + unstoppable certs
          Planner->>Chain: Simulate account abstraction payloads (eth_call)
          Chain-->>Planner: Simulation receipts (gasless)
          Planner->>Treasury: Allocate unstoppable reserves & alpha streams
          Treasury-->>Planner: Confirm unstoppable buffer >= 45%
          Planner->>Chain: Execute job + validator automation
          Chain-->>Console: Events + scoreboard updates
          Console-->>Owner: Sovereign dashboard + override controls
        """
    ).strip()

    mermaid_gantt = dedent(
        """
        gantt
          title Meta-Agentic α-AGI Jobs V10 Flight Path
          dateFormat HH:mm
          axisFormat %H:%M
          section Identify
            Multi-domain scan :done, 00:00, 00:02
            Sentinel synthesis :active, 00:02, 00:05
          section Out-Learn
            Curriculum evolution : 00:05, 00:09
            MuZero forecasting : 00:07, 00:12
          section Out-Think
            Meta-planner search : 00:12, 00:18
            Guardian quorum proofs : 00:15, 00:19
          section Out-Design
            Creative hyperforge : 00:18, 00:24
            Owner override calibration : 00:22, 00:26
          section Out-Strategise
            Treasury flywheel program : 00:24, 00:30
            Antifragility rehearsal : 00:26, 00:31
          section Out-Execute
            4337 execution bundle : 00:30, 00:34
            Scoreboard enrichment : 00:31, 00:35
        """
    ).strip()

    mermaid_radar = dedent(
        f"""
        %%{{init: {{'theme': 'forest'}} }}%%
        radarChart
          title Omnidominion Capability Radar
          axes Automation, Resilience, Empowerment, Velocity, Stewardship
          dataset Owner
            data {owner_empowerment:.2f}, {guardian_resilience:.2f}, {sovereignty_index:.2f}, {alpha_conversion:.2f}, {meta_ci_health:.2f}
        """
    ).strip()

    mermaid_journey = dedent(
        """
        journey
          title Owner Empowerment Journey
          section Inception
            Launch omni charter: 5
            Review unstoppable levers: 5
          section Execution
            Approve guardian quorum: 4
            Inject override scripts: 5
          section Governance
            Adjust treasury routes: 5
            Sign CI V2 attestations: 4
        """
    ).strip()

    mermaid_state = dedent(
        """
        stateDiagram-v2
          [*] --> Identify
          Identify --> Learn
          Learn --> Think
          Think --> Design
          Design --> Strategise
          Strategise --> Execute
          Execute --> Monitor
          Monitor --> Strategise : Anomaly detected
          Monitor --> [*] : Owner shutdown
          Strategise --> [*] : Owner approves compounding
        """
    ).strip()

    mermaid_quadrant = dedent(
        """
        quadrantChart
          title Sovereign Command Quadrant
          x-axis Execution Velocity --> Governance Depth
          y-axis Automation --> Human Oversight
          quadrant-1 Hyper Autopilot
          quadrant-2 Sovereign Stewardship
          quadrant-3 Guardian Drill
          quadrant-4 Opportunity Lab
          point 0.9 0.95 Hyper Autopilot
          point 0.8 0.92 Sovereign Stewardship
          point 0.7 0.85 Guardian Drill
          point 0.88 0.8 Opportunity Lab
        """
    ).strip()

    mermaid.update(
        {
            "flow_v10": mermaid_flow,
            "sequence_v10": mermaid_sequence,
            "gantt_v10": mermaid_gantt,
            "radar_v10": mermaid_radar,
            "journey_v10": mermaid_journey,
            "state_v10": mermaid_state,
            "quadrant_v10": mermaid_quadrant,
        }
    )

    base_payload["ci_v2"] = ci_v2
    base_payload.setdefault("alpha_network", hyperstructure)
    base_payload.setdefault("market_sentinels", market)
    base_payload.setdefault("execution_matrix", execution)
    return base_payload


def generate_omni_report(package_root: Path, summary: Dict[str, Any], dashboard: Dict[str, Any]) -> Path:
    """Generate the omnidominion markdown report."""

    report_path = package_root / "reports" / "generated" / "alpha_meta_omnidominion_masterplan.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    metrics = dashboard.get("metrics", {})
    mermaid_payload = dashboard.get("mermaid", {})
    sovereignty_matrix = json.dumps(dashboard.get("control_surface", {}), indent=2)
    scoreboard = json.dumps(metrics.get("scoreboard", {}), indent=2)

    report = dedent(
        f"""
        # Meta-Agentic α-AGI Jobs Demo V10 — Omnidominion Masterplan

        ## Mission Summary

        - Scenario: {summary.get('scenarioId')}
        - Run ID: {summary.get('runId', 'N/A')}
        - Guardian approvals: {', '.join(summary.get('approvals', [])) or 'N/A'}
        - Agents onboarded: {', '.join(summary.get('agents', [])) or 'N/A'}

        ## Omnidominion Metrics

        - Owner empowerment: {metrics.get('owner_empowerment', 0)*100:.2f}%
        - Sovereignty index: {metrics.get('sovereignty_index', 0)*100:.2f}%
        - Unstoppable readiness: {metrics.get('unstoppable_readiness', 0)*100:.2f}%
        - Autopilot mastery: {metrics.get('autopilot_mastery', 0)*100:.2f}%
        - Meta-CI health: {metrics.get('meta_ci_health', 0)*100:.2f}%
        - Capital flywheel index: {metrics.get('capital_flywheel_index', 0)*100:.2f}%
        - Guardian resilience: {metrics.get('guardian_resilience', 0)*100:.2f}%
        - Superintelligence yield: {metrics.get('superintelligence_yield', 0)*100:.2f}%
        - Alpha conversion: {metrics.get('alpha_conversion', 0)*100:.2f}%
        - Owner command latency: {metrics.get('owner_command_latency_seconds', 0)} seconds
        - Owner approval speed: {metrics.get('owner_approval_speed_minutes', 0)} minutes

        ## Sovereign Capability Radar

        ```mermaid
        {mermaid_payload.get('radar_v10', '')}
        ```

        ## Hyperstructure Flow

        ```mermaid
        {mermaid_payload.get('flow_v10', '')}
        ```

        ## Guardian Coordination Sequence

        ```mermaid
        {mermaid_payload.get('sequence_v10', '')}
        ```

        ## Mission Timeline

        ```mermaid
        {mermaid_payload.get('gantt_v10', '')}
        ```

        ## Owner Journey

        ```mermaid
        {mermaid_payload.get('journey_v10', '')}
        ```

        ## Sovereign State Machine

        ```mermaid
        {mermaid_payload.get('state_v10', '')}
        ```

        ## Command Quadrant

        ```mermaid
        {mermaid_payload.get('quadrant_v10', '')}
        ```

        ## Sovereignty Control Surface

        ```json
        {sovereignty_matrix}
        ```

        ## Scoreboard Snapshot

        ```json
        {scoreboard}
        ```
        """
    ).strip() + "\n"

    report_path.write_text(report, encoding="utf-8")
    return report_path


def run_meta_omni_demo(
    config_path: Path | None = None,
    *,
    timeout: float = 240.0,
) -> MetaOmniSovereigntyOutcome:
    """Execute the Meta-Agentic α-AGI Jobs V10 demonstration."""

    if config_path is None:
        config_path = DEFAULT_CONFIG_PATH
    config = load_configuration(config_path)
    mandate = validate_owner_omni_mandate(config)

    package_root = config.base_dir
    demo_root = package_root.parent

    env_map = prepare_environment(demo_root)
    outcome = run_demo(config, timeout=timeout)

    summary = json.loads(outcome.summary_path.read_text(encoding="utf-8"))
    summary["approvals"] = config.approvals
    summary["scenarioId"] = config.payload.get("scenario", {}).get("id")
    summary["agents"] = outcome.metadata.get("onboarded_agents", [])

    scoreboard_path = Path(env_map["ORCHESTRATOR_SCOREBOARD_PATH"])
    scoreboard = outcome.scoreboard_snapshot or {}
    if not scoreboard_path.exists():
        scoreboard_path.write_text(json.dumps(scoreboard, ensure_ascii=False, indent=2), encoding="utf-8")

    dashboard_payload = generate_omni_dashboard(package_root, summary, scoreboard, mandate)
    dashboard_path = package_root / "ui" / "dashboard-data-v10.json"
    dashboard_path.write_text(json.dumps(dashboard_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    report_path = generate_omni_report(package_root, summary, dashboard_payload)

    latest_run_path = demo_root / "storage" / "latest_run_v10.json"
    latest_run_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    return MetaOmniSovereigntyOutcome(
        base=outcome,
        summary_path=latest_run_path,
        dashboard_path=dashboard_path,
        report_path=report_path,
        scoreboard_path=scoreboard_path,
        dashboard_payload=dashboard_payload,
        mandate=mandate,
    )


__all__ = [
    "DEFAULT_CONFIG_PATH",
    "OwnerOmniSovereigntyMandate",
    "MetaOmniSovereigntyOutcome",
    "prepare_environment",
    "validate_owner_omni_mandate",
    "generate_omni_dashboard",
    "generate_omni_report",
    "run_meta_omni_demo",
]
