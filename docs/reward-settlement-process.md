# Reward Settlement Process

The reward engine settles each epoch by converting reduced free energy into tokens and reputation. The diagrams below illustrate the end-to-end flow from job completion to payouts.

## High-Level Pipeline

```mermaid
flowchart TB
    classDef stage fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef role fill:#eef9ff,stroke:#004a99,stroke-width:1px;
    classDef engine fill:#dff9fb,stroke:#00a8ff,stroke-width:1px;
    classDef out fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;

    subgraph Lifecycle
        Emp[Employer posts job]:::role --> Ag[Agent completes]:::role --> Val[Validator finalises]:::role
    end
    Lifecycle --> EO[EnergyOracle attests]:::engine
    EO --> RE[RewardEngineMB\nΔG & MB weights]:::stage
    RE --> TH[Thermostat adjusts T]:::engine
    RE --> FP[FeePool distributes tokens]:::out
    RE --> REP[ReputationEngine updates scores]:::out
    FP -->|65%| RA[Agents]:::role
    FP -->|15%| RV[Validators]:::role
    FP -->|15%| RO[Operators]:::role
    FP -->|5%| REb[Employers]:::role
    REP --> RA
    REP --> RV
    REP --> RO
    REP --> REb
```

## End-to-End Overview

```mermaid
flowchart LR
    classDef role fill:#eef9ff,stroke:#004a99,stroke-width:1px;
    classDef step fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef out fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;
    classDef rep fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;

    subgraph Job["Job Lifecycle"]
        E1[Employer posts job]:::role --> A1[Agent submits work]:::role --> V1[Validator approves]:::role
    end

    subgraph Energy["Energy Accounting"]
        V1 --> OR[EnergyOracle attests metrics]:::step --> RE[RewardEngineMB computes ΔG]:::step --> TH[Thermostat adjusts T]:::step
    end

    subgraph Distribution
        RE --> FP[FeePool allocates tokens]:::out
        RE --> REP[ReputationEngine updates scores]:::rep
    end

    FP --> A2[Agent reward]:::role
    FP --> V2[Validator reward]:::role
    FP --> O2[Operator reward]:::role
    FP --> E2[Employer rebate]:::role
    REP --> A2
    REP --> V2
    REP --> O2
    REP --> E2
```

## Free-Energy Flow

```mermaid
flowchart TD
    %% Job completion flows through energy oracle and thermostat into MB rewards

    classDef sensor fill:#dff9fb,stroke:#00a8ff,stroke-width:1px;
    classDef calc fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef dist fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;
    classDef rep fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;

    Start((Job Completed)) --> EO["EnergyOracle\nattests Eᵢ,gᵢ,u_pre,u_post,value"]:::sensor
    EO --> EN[RewardEngineMB]:::calc
    EN --> TH[Thermostat]:::sensor
    TH --> EN
    EN --> G["ΔG = (Value − Costs) − Tₛ·ΔS"]:::calc
    G --> B{"Budget = κ·max(0, −ΔG)"}:::calc
    B --> MB["MB weights per role"]:::calc
    MB --> FP(FeePool):::dist
    MB --> REP(ReputationEngine):::dist
    FP -->|65%| Agent
    FP -->|15%| Validator
    FP -->|15%| Operator
    FP -->|5%| Employer
    REP --> Agent
    REP --> Validator
    REP --> Operator
    REP --> Employer

    class EO sensor;
    class TH sensor;
    class EN,G,B,MB calc;
    class FP,REP dist;
    class Agent,Validator,Operator,Employer rep;
```

## Settlement Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Employer
    participant Agent
    participant Validator
    participant Operator
    participant Oracle as EnergyOracle
    participant Engine as RewardEngineMB
    participant Thermostat
    participant FeePool
    participant Reputation

    Employer->>Agent: Post job & funds
    Agent->>Validator: Submit work
    Validator->>Employer: Approve results
    Agent->>Oracle: Report energy use
    Oracle-->>Engine: Signed attestation
    Engine->>Thermostat: Query Tₛ/Tᵣ
    Thermostat-->>Engine: Temperatures
    Engine->>Engine: Compute ΔG & weights
    Engine->>FeePool: Allocate rewards
    Engine->>Reputation: Update scores
    FeePool-->>Agent: Token reward
    FeePool-->>Validator: Token reward
    FeePool-->>Operator: Token reward
    FeePool-->>Employer: Rebate
    Reputation-->>Agent: Reputation ↑
    Reputation-->>Validator: Reputation ↑
    Reputation-->>Operator: Reputation ↑
    Reputation-->>Employer: Reputation ↑
    Note over FeePool,Reputation: Rewards and reputation finalised
```

## Settlement States

```mermaid
stateDiagram-v2
    [*] --> Data
    Data: Collect job metrics
    Data --> Budget: Compute ΔH & ΔS
    Budget --> Weights: Apply MB weights
    Weights --> Rewards: Distribute tokens
    Rewards --> Reputation: Update scores
    Reputation --> [*]
```

## Module Interaction Overview

```mermaid
flowchart LR
    classDef sensor fill:#dff9fb,stroke:#00a8ff,stroke-width:1px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;
    classDef dist fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;
    classDef role fill:#eef9ff,stroke:#004a99,stroke-width:1px;

    subgraph Sensors
        EO((EnergyOracle)):::sensor
        TH((Thermostat)):::sensor
    end

    subgraph Engine["RewardEngineMB"]
        MB{{MB Weights}}:::engine
    end

    subgraph Outputs
        FP((FeePool)):::dist
        REP((ReputationEngine)):::dist
    end

    subgraph Roles
        AG[Agent]:::role
        VD[Validator]:::role
        OP[Operator]:::role
        EM[Employer]:::role
    end

    EO --> Engine
    TH --> Engine
    Engine --> MB
    MB --> FP
    MB --> REP
    FP --> AG
    FP --> VD
    FP --> OP
    FP --> EM
    REP --> AG
    REP --> VD
    REP --> OP
    REP --> EM
```

## Participant Journey

```mermaid
journey
    title Reward Settlement Journey
    section Job Lifecycle
      Post job & fund escrow: 5: Employer
      Complete work: 5: Agent
      Validate result: 5: Validator
    section Incentive Loop
      Attest energy: 4: EnergyOracle
      Settle epoch: 4: RewardEngineMB
      Distribute rewards: 5: FeePool
      Reputation update: 5: ReputationEngine
```

```mermaid
timeline
    title Epoch Reward Settlement
    Job completion: Work finished
    Energy attestation: Oracle signs metrics
    Temperature query: Engine pulls Tₛ/Tᵣ
    Free-energy budget: ΔG evaluated
    MB distribution: Rewards allocated
    Reputation update: Efficiency recorded
```
