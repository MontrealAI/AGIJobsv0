# Astral Citadel Systems Map

Deep dive into the control surfaces, coordination mesh, and thermal feedback loops underpinning the Astral Citadel storyline.

---

## Control Surface Overlay

```mermaid
flowchart TB
    classDef control fill:#111827,stroke:#f97316,color:#fde68a;
    classDef execution fill:#082f49,stroke:#22d3ee,color:#e0f2fe;
    classDef analytics fill:#0f172a,stroke:#a855f7,color:#fdf2ff;

    subgraph Control Surfaces
        OwnerAtlas[scripts/v2/ownerControlAtlas.ts]:::control
        MissionControl[scripts/v2/ownerMissionControl.ts]:::control
        ChangeTicket[scripts/v2/ownerChangeTicket.ts]:::control
    end

    subgraph Execution Fabric
        OneClick[ scripts/v2/oneclick-stack.ts ]:::execution
        Thermostat[scripts/v2/updateThermostat.ts]:::execution
        RewardEngine[scripts/v2/updateRewardEngine.ts]:::execution
        PlatformRegistry[scripts/v2/updatePlatformRegistry.ts]:::execution
    end

    subgraph Analytics Layer
        Sentinels[npm run monitoring:sentinels]:::analytics
        Observability[npm run observability:smoke]:::analytics
        Hamiltonian[npm run hamiltonian:report]:::analytics
    end

    OwnerAtlas --> OneClick
    OwnerAtlas --> Thermostat
    OwnerAtlas --> RewardEngine
    MissionControl --> Sentinels
    MissionControl --> Observability
    ChangeTicket --> PlatformRegistry
    RewardEngine --> Hamiltonian
    Thermostat --> Hamiltonian
```

---

## Supply & Aid Mesh

```mermaid
graph LR
    classDef supply fill:#0f172a,color:#bbf7d0,stroke:#34d399;
    classDef aid fill:#111827,color:#fecdd3,stroke:#fb7185;
    classDef infra fill:#1f2937,color:#c7d2fe,stroke:#6366f1;
    classDef treasury fill:#0f172a,color:#fef3c7,stroke:#f59e0b;

    S1[supply.mesh.agent.agi.eth]:::supply -->|posts| JR( JobRegistry )
    A1[aid.response.agent.agi.eth]:::aid -->|stake| SM( StakeManager )
    I1[infrastructure.delta.agent.agi.eth]:::infra -->|validations| VM( ValidationModule )
    T1[treasury.operator.agent.agi.eth]:::treasury -->|thermostat payloads| TH( Thermostat )

    JR --> DM( DisputeModule )
    VM --> DM
    DM --> JR
    JR --> RE( RewardEngineMB )
    TH --> RE
    RE --> FP( FeePool )
    FP --> Treasury( Treasury Multisig )
```

---

## Thermal Feedback Loop

```mermaid
sequenceDiagram
    participant EO as EnergyOracle
    participant TH as Thermostat
    participant RE as RewardEngineMB
    participant FP as FeePool
    participant GOV as Governance (Safe)

    EO->>TH: Energy + entropy snapshot
    TH->>RE: Adjusted temperature (T) & KPI weights
    RE->>FP: Distribute shares (agents/validators/operators/employers)
    FP-->>GOV: Treasury buffer health & burn statistics
    GOV->>TH: Execute `npm run thermostat:update`
    GOV->>RE: Execute `npm run reward-engine:update`
```

---

## CI-ready Automation Threads

```mermaid
flowchart LR
    classDef job fill:#111827,color:#fef3c7,stroke:#fbbf24;
    classDef gate fill:#0f172a,color:#bae6fd,stroke:#38bdf8;

    GitHub[GitHub Actions `ci (v2)`]:::job --> Toolchain[make verify]:::job
    Toolchain --> Orchestration[make mission]:::job
    Orchestration --> Receipts[make report]:::job
    Receipts --> Publish[npm run release:manifest:summary]:::job
    Publish --> Gate{{Branch protection}}:::gate
```

The CI path is identical to the existing repository workflow and therefore deployable today without introducing new jobs.

---

## Key Repository Touchpoints

| Domain | Files / Scripts | Purpose |
| --- | --- | --- |
| Smart contracts | `contracts/v2/*.sol` | Settlement, staking, validation, thermal incentives |
| Governance tooling | `scripts/v2/owner*.ts` | Safe bundles, telemetry, emergency controls |
| Economic levers | `scripts/v2/updateThermodynamics.ts`, `scripts/v2/updateRewardEngine.ts` | Temperature & incentive adjustments |
| Observability | `scripts/hamiltonian-tracker.ts`, `scripts/monitoring/render-sentinels.ts` | Energy drift, sentinel dashboards |
| Orchestration | `scripts/v2/asiGlobalDemo.ts`, `orchestrator/*.py` | Multi-sector plan execution |

These references ensure the Astral Citadel documentation remains grounded in the existing AGI Jobs v0 (v2) code paths.
