# α-AGI MARK Operator Command Console

The command console is a briefing aid for non-technical launch stewards.  It
layers multiple visualisations so the operator can reason about every control
lever exposed by AGI Jobs v0 (v2) before, during, and after ignition.

## Systems Constellation

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#101546', 'lineColor': '#60ffcf', 'secondaryColor': '#0d2818', 'textColor': '#f7faff'}}}%%
quadrantChart
    title Mission posture across the α-AGI MARK lifecycle
    x-axis Low Autonomy --> High Autonomy
    y-axis Manual Oversight --> Autonomous Safeguards
    quadrant-1 Sovereign Autopilot
    quadrant-2 Guided Launchpad
    quadrant-3 Manual Sandbox
    quadrant-4 Governance Workshop
    "NovaSeed Minting" : [0.15, 0.20]
    "Validator Council" : [0.35, 0.75]
    "Bonding Curve Trades" : [0.70, 0.65]
    "Emergency Exit" : [0.45, 0.30]
    "Sovereign Vault" : [0.85, 0.80]
```

## Launch Timeline

```mermaid
timeline
    title α-AGI MARK supersequence
    Operator Alignment : Collect wallets, confirm balances, stage dry-run
    Nova-Seed Genesis : Deploy ERC-721, mint mission seed
    Council Formation : Install validators, publish quorum policy
    Market Resonance : Bonding curve engages, whitelist + pause levers tested
    Validation Pulse : Approvals recorded, overrides remain dormant
    Sovereign Ascension : finalizeLaunch() transfers reserve + metadata
    Command Recap : Dashboard, owner matrix, audit artefacts delivered
```

## Safety Relay Map

```mermaid
stateDiagram-v2
    [*] --> Orchestration
    Orchestration --> DryRunSentinel: AGIJOBS_DEMO_DRY_RUN = true
    Orchestration --> BroadcastConfirm: AGIJOBS_DEMO_DRY_RUN = false
    BroadcastConfirm -->|"launch"| DeploymentStream
    BroadcastConfirm -->|other input| Abort
    DeploymentStream --> MarketLive
    MarketLive --> Paused: pauseMarket()
    Paused --> EmergencyExit: abortLaunch() / setEmergencyExit(true)
    EmergencyExit --> ParticipantRefunds
    MarketLive --> SovereignDispatch: finalizeLaunch()
    SovereignDispatch --> VaultAcknowledge
    VaultAcknowledge --> DashboardEmission
    ParticipantRefunds --> DashboardEmission
    DashboardEmission --> [*]
```

### Usage Notes

1. Review the **quadrant chart** to communicate autonomy vs. oversight for each
   subsystem when briefing stakeholders.
2. Use the **timeline** as a status board while the orchestrator runs; each
   segment corresponds to live log messages in `npm run demo:alpha-agi-mark`.
3. Follow the **safety relay map** during incident response drills to confirm
   which branch of control logic is active.
4. Pair this console with the [`Operator Empowerment Atlas`](operator-empowerment-atlas.md)
   to deliver both strategic and tactical clarity without touching Solidity.
