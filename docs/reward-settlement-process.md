# Reward Settlement Process

The reward engine settles each epoch by converting reduced free energy into tokens and reputation. The diagrams below illustrate the end-to-end flow from job completion to payouts.

## Free-Energy Flow

```mermaid
flowchart TD
    Start((Job Completed)) --> Oracle["EnergyOracle\nattests E_i,g_i,u_pre,u_post,value"]
    Oracle --> Engine[RewardEngineMB]
    Engine --> Thermostat
    Thermostat --> Engine
    Engine --> Budget["ΔG → κ·budget"]
    Budget --> Weights["MB weights per role"]
    Weights --> FeePool
    Weights --> ReputationEngine
    FeePool -->|65%| Agent
    FeePool -->|15%| Validator
    FeePool -->|15%| Operator
    FeePool -->|5%| Employer
    ReputationEngine --> Agent
    ReputationEngine --> Validator
    ReputationEngine --> Operator
    ReputationEngine --> Employer
    classDef core fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;
    class Engine,Thermostat,Oracle,FeePool,ReputationEngine,Budget,Weights core;
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
```
