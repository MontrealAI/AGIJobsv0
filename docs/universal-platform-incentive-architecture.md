# Universal Platform Incentive Architecture

The AGI Jobs v2 suite implements a single, stake‑based framework that treats the main deployer and third‑party operators under the same rules. Every value transfer occurs on‑chain in the 18‑decimal **$AGIALPHA** token.

## Roles

| Role              | StakeManager enum | Purpose                                              |
| ----------------- | ----------------- | ---------------------------------------------------- |
| Employer          | n/a               | Posts jobs and escrows rewards.                      |
| Agent             | `0`               | Completes jobs.                                      |
| Validator         | `1`               | Audits and finalises jobs.                           |
| Platform Operator | `2`               | Hosts an AGI Jobs portal and receives protocol fees. |

## Core Modules

- **AGIALPHAToken** – 18‑decimal ERC‑20 used for staking, rewards and dispute bonds. The production `$AGIALPHA` token lives outside this repository; [`AGIALPHAToken.sol`](../contracts/test/AGIALPHAToken.sol) is provided only for local testing.
- **StakeManager** – records stakes for all roles, escrows job funds and routes protocol fees to the `FeePool`. Owner setters allow changing the minimum stake, slashing percentages and treasury.
- **PlatformRegistry** – lists operators and computes a routing score derived from stake and reputation. The owner can blacklist addresses or replace the reputation engine.
- **JobRouter** – selects an operator for new jobs using `PlatformRegistry` scores. Deterministic randomness mixes caller‑supplied seeds with blockhashes; no external oracle is required.
- **FeePool** – receives fees from `StakeManager` and distributes them to staked operators in proportion to their stake. The owner can adjust burn percentage, treasury and reward role without redeploying.
- **PlatformIncentives** – helper that stakes `$AGIALPHA` on behalf of an operator and registers them with both `PlatformRegistry` and `JobRouter`. The owner (main deployer) may register with `amount = 0` to remain tax neutral and earn no routing or fee share. When routing or fee sharing isn't required, operators can instead call `PlatformRegistry.stakeAndRegister` or `acknowledgeStakeAndRegister` directly.

### RewardEngineMB, Thermostat & EnergyOracle

`RewardEngineMB` tracks a free‑energy budget for each role. The `EnergyOracle` reports per‑task consumption and the `Thermostat` compares it with role allocations, adjusting reward weight when usage falls below budget. Efficient agents therefore earn a larger share of fees and gain reputation faster.

```mermaid
%% Interactive view linking core modules
flowchart TB
    classDef offchain fill:#dff9fb,stroke:#00a8ff,stroke-width:2px;
    classDef onchain fill:#e8ffe8,stroke:#2e7d32,stroke-width:2px;
    classDef control fill:#fff5e6,stroke:#ffa200,stroke-width:2px;
    classDef payout fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px;

    subgraph Off-Chain Services
        EO[fa:fa-bolt EnergyOracle]:::offchain
    end

    subgraph On-Chain Incentive Layer
        RE[fa:fa-coins RewardEngineMB]:::onchain
        TH[fa:fa-thermometer-half Thermostat]:::control
        FP[fa:fa-piggy-bank FeePool]:::payout
        REP[fa:fa-star ReputationEngine]:::payout
    end

    EO -- Signed attestation --> RE
    RE -- Query temperature --> TH
    TH -- Tₛ/Tᵣ --> RE
    RE -- Feedback loop --> TH
    RE -- Token rewards --> FP
    RE -- Reputation delta --> REP

    click EO "../contracts/v2/EnergyOracle.sol" "EnergyOracle.sol"
    click RE "../contracts/v2/RewardEngineMB.sol" "RewardEngineMB.sol"
    click TH "../contracts/v2/Thermostat.sol" "Thermostat.sol"
    click FP "../contracts/v2/FeePool.sol" "FeePool.sol"
    click REP "../contracts/v2/ReputationEngine.sol" "ReputationEngine.sol"
```

```mermaid
flowchart LR
    classDef oracle fill:#dff9fb,stroke:#00a8ff,stroke-width:2px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:2px;
    classDef thermo fill:#fff5e6,stroke:#ffa200,stroke-width:2px;
    classDef payout fill:#fdf5ff,stroke:#8e24aa,stroke-width:2px;

    subgraph Off-Chain
        EO[EnergyOracle]:::oracle
    end
    subgraph On-Chain
        RE[RewardEngineMB]:::engine
        TH[Thermostat]:::thermo
        FP[FeePool]:::payout
        REP[ReputationEngine]:::payout
    end

    EO -->|signed metrics| RE
    RE -->|temperature query| TH
    TH -->|Tₛ/Tᵣ| RE
    RE -->|usage feedback| TH
    RE -->|token rewards| FP
    RE -->|reputation updates| REP
```

```mermaid
classDiagram
    class EnergyOracle {
        +attest(E_i,g_i,ΔS,value)
    }
    class Thermostat {
        +getTemperature(role)
        +adjust(error)
    }
    class RewardEngineMB {
        +settleEpoch(data)
        -computeDeltaG()
        -mbWeights()
    }
    class FeePool {
        +reward(address,amount)
    }
    class ReputationEngine {
        +update(address,delta)
    }

    EnergyOracle --> RewardEngineMB : metrics
    RewardEngineMB --> Thermostat : usage feedback
    Thermostat --> RewardEngineMB : Tₛ/Tᵣ
    RewardEngineMB --> FeePool : token rewards
    RewardEngineMB --> ReputationEngine : rep updates
```

```mermaid
flowchart LR
    classDef oracle fill:#dff9fb,stroke:#00a8ff,stroke-width:1px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;
    classDef thermo fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef out fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;

    EO[EnergyOracle]:::oracle --> RE[RewardEngineMB]:::engine
    RE -->|query Tₛ/Tᵣ| TH[Thermostat]:::thermo
    TH -->|temperatures| RE
    RE -->|usage feedback| TH
    RE --> FP[FeePool]:::out
    RE --> REP[ReputationEngine]:::out
```

```mermaid
sequenceDiagram
    autonumber
    participant EO as EnergyOracle
    participant RE as RewardEngineMB
    participant TH as Thermostat
    participant FP as FeePool
    participant REP as ReputationEngine

    EO->>RE: attest(Eᵢ,gᵢ,ΔS,value)
    RE->>TH: request Tₛ/Tᵣ
    TH-->>RE: temperature supply
    RE->>RE: compute ΔG & weights
    RE->>TH: feedback usage
    RE->>FP: reward allocations
    RE->>REP: reputation updates
```

```mermaid
stateDiagram-v2
    classDef oracle fill:#dff9fb,stroke:#00a8ff,stroke-width:1px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;
    classDef thermo fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef out fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;

    [*] --> Oracle
    Oracle --> Engine
    Engine --> Thermostat
    Thermostat --> Engine
    Engine --> Outputs
    Outputs --> [*]

    state Oracle { [*] --> "Attest energy" }
    state Engine {
        [*] --> "Verify metrics"
        "Verify metrics" --> "ΔG & MB weights"
    }
    state Thermostat { [*] --> "PID adjust" }
    state Outputs { [*] --> "FeePool & Reputation" }

    class Oracle oracle;
    class Engine engine;
    class Thermostat thermo;
    class Outputs out;
```

```mermaid
flowchart LR
    classDef oracle fill:#dff9fb,stroke:#00a8ff,stroke-width:1px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;
    classDef thermo fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef out fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;

    subgraph EO["EnergyOracle"]
        EO1[Capture metrics]
        EO2[Sign attestation]
    end

    subgraph RE["RewardEngineMB"]
        RE1[Verify & aggregate]
        RE2[Compute ΔG & MB weights]
    end

    subgraph TH["Thermostat"]
        TH1[(Tₛ/Tᵣ)]
        TH2[PID adjust]
    end

    EO1 --> EO2
    EO2 -->|attestation| RE1
    RE1 --> RE2
    RE2 -->|query temp| TH1
    TH1 --> RE2
    RE2 -->|usage feedback| TH2
    TH2 --> TH1
    RE2 --> FP((FeePool)):::out
    RE2 --> REP((ReputationEngine)):::out
```

| Energy Used (kJ) | Reward Weight | Reputation Gain |
| ---------------- | ------------- | --------------- |
| 20               | 1.0×          | +5              |
| 10               | 1.8×          | +9              |

```mermaid
flowchart TD
    %% Energy attestation → temperature control → rewards and reputation

    classDef oracle fill:#dff9fb,stroke:#00a8ff,stroke-width:1px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;
    classDef thermo fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef out fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;

    subgraph EO["EnergyOracle"]
        EO1[Measure Eᵢ,gᵢ,ΔS,value]
        EO2[Sign attestation]
    end

    subgraph RE["RewardEngineMB"]
        RE1[Verify attestation]
        RE2[Compute ΔG]
        RE3[Apply MB weights]
    end

    subgraph TH["Thermostat"]
        TH1[Provide Tₛ/Tᵣ]
    end

    EO1 --> EO2
    EO2 --> RE1
    RE1 --> RE2
    RE2 --> TH1
    TH1 --> RE3
    RE3 --> FP((FeePool)):::out
    RE3 --> REP((ReputationEngine)):::out

    class EO1,EO2 oracle;
    class RE1,RE2,RE3 engine;
    class TH1 thermo;
    class FP,REP out;
```

```mermaid
flowchart LR
    subgraph Inputs["Sensors"]
        EO((EnergyOracle))
    end
    subgraph Control["Thermostat"]
        TH((Thermostat))
    end
    subgraph Engine["RewardEngineMB"]
        RE[[RewardEngineMB]]
        MB{{MB Weights}}
    end
    subgraph Outputs["Distribution"]
        FP((FeePool))
        REP[[ReputationEngine]]
    end
    subgraph Roles
        A[(Agent)]
        V[(Validator)]
        O[(Operator)]
        E[(Employer)]
    end

    A -. "energy use" .-> EO
    V -. "energy use" .-> EO
    O -. "energy use" .-> EO
    E -. "energy use" .-> EO

    EO -- "attest E_i,g_i" --> RE
    TH -- "Tₛ/Tᵣ" --> RE
    RE --> MB
    MB --> FP
    MB --> REP
    FP -->|65%| A
    FP -->|15%| V
    FP -->|15%| O
    FP -->|5%| E
    REP --> A
    REP --> V
    REP --> O
    REP --> E

    classDef meas fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef ctrl fill:#e6f2ff,stroke:#0366d6,stroke-width:1px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;
    classDef out fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;
    classDef roles fill:#eef9ff,stroke:#004a99,stroke-width:1px;

    class EO meas;
    class TH ctrl;
    class RE,MB engine;
    class FP,REP out;
    class A,V,O,E roles;
```

```mermaid
sequenceDiagram
    autonumber
    participant EO as EnergyOracle
    participant RE as RewardEngineMB
    participant TH as Thermostat
    loop each epoch
        EO->>RE: attest(Eᵢ,gᵢ,ΔS,value)
        RE->>TH: request Tₛ/Tᵣ
        TH-->>RE: return temperatures
        RE->>TH: report usage error
        TH-->>RE: adjust Tₛ/Tᵣ
        RE->>RE: compute ΔG & weights
    end
    Note over EO,TH: PID loop keeps rewards energy-efficient
```

#### Comprehensive Interaction Map

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#2e7d32', 'edgeLabelBackground':'#fff' }}}%%
graph TB
    classDef oracle fill:#dff9fb,stroke:#0984e3,stroke-width:2px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:2px;
    classDef thermo fill:#fff5e6,stroke:#ffa200,stroke-width:2px;
    classDef aux fill:#fdf5ff,stroke:#8e24aa,stroke-width:2px;
    classDef user fill:#e1f5fe,stroke:#0277bd,stroke-width:2px;

    subgraph OffChain
        EO[/Energy Oracle/]:::oracle
    end

    subgraph OnChain
        subgraph IncentiveCore
            RE[[RewardEngineMB]]:::engine
            TH{{Thermostat}}:::thermo
        end
        FP[(FeePool)]:::aux
        REP[(ReputationEngine)]:::aux
    end

    EO --|attested metrics| RE
    RE --|temperature query| TH
    TH --|Tₛ/Tᵣ| RE
    RE --|usage feedback| TH
    RE --|token rewards| FP
    RE --|reputation delta| REP
    FP --|payouts| U[(Participants)]:::user
    REP --|score updates| U
```

### Reward Settlement Process

```mermaid
flowchart TD
    classDef actor fill:#e1f5fe,stroke:#0277bd,stroke-width:2px;
    classDef oracle fill:#fff9c4,stroke:#fbc02d,stroke-width:2px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:2px;
    classDef thermo fill:#fff5e6,stroke:#ffa200,stroke-width:2px;
    classDef payout fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px;

    Employer:::actor -->|post job & funds| Agent:::actor
    Agent -->|submit work| Validator:::actor
    Validator -->|approve| Employer
    Agent --> EO[EnergyOracle]:::oracle
    EO --> RE[RewardEngineMB]:::engine
    RE --> TH[Thermostat]:::thermo
    TH --> RE
    RE --> FP[FeePool]:::payout
    RE --> REP[ReputationEngine]:::payout
    FP --> Agent
    FP --> Validator
    FP --> Operator:::actor
    FP --> Employer
    REP --> Agent
    REP --> Validator
    REP --> Operator
    REP --> Employer
```

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
    Note over Engine: budget = κ·max(0,-(ΔH - Tₛ·ΔS))
    Engine->>Engine: Compute MB weights
    par Distribution
        Engine->>FeePool: Allocate rewards
        Engine->>Reputation: Update scores
    and Payouts
        FeePool-->>Agent: Token reward
        FeePool-->>Validator: Token reward
        FeePool-->>Operator: Token reward
        FeePool-->>Employer: Rebate
        Reputation-->>Agent: Reputation ↑
        Reputation-->>Validator: Reputation ↑
        Reputation-->>Operator: Reputation ↑
        Reputation-->>Employer: Reputation ↑
    end
    Note over FeePool,Reputation: Rewards and reputation finalised
```

#### Reward Settlement State Machine

```mermaid
stateDiagram-v2
    [*] --> AwaitingEpoch
    AwaitingEpoch --> CollectingAttestations : job results arrive
    CollectingAttestations --> Budgeting : metrics aggregated
    Budgeting --> TemperatureCheck : query thermostat
    TemperatureCheck --> Weighting : MB weighting
    Weighting --> Distribution : reward & reputation
    Distribution --> EpochClosed
    EpochClosed --> AwaitingEpoch : next epoch

    note right of TemperatureCheck
      Thermostat tunes system temperature
    end note
```

#### End-to-End Reward Settlement Flowchart

```mermaid
flowchart TD
    classDef off fill:#dff9fb,stroke:#00a8ff,stroke-width:2px;
    classDef on fill:#e8ffe8,stroke:#2e7d32,stroke-width:2px;
    classDef out fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px;

    subgraph Off-Chain
        A[Agent metrics submitted]:::off --> O[EnergyOracle signs]:::off
    end

    subgraph On-Chain Settlement
        O --> R[RewardEngineMB verifies & aggregates]:::on
        R --> T[Thermostat adjusts temperature]:::on
        T --> R
        R --> D[FeePool distributes tokens]:::out
        R --> U[ReputationEngine updates scores]:::out
    end

    D -->|tokens| Agent
    D -->|tokens| Validator
    D -->|tokens| Operator
    D -->|rebate| Employer
    U -->|reputation| Agent
    U -->|reputation| Validator
    U -->|reputation| Operator
    U -->|reputation| Employer
```

Every contract rejects direct ETH and exposes `isTaxExempt()` so neither the contracts nor the owner ever hold taxable revenue. Participants interact only through token transfers.

## Incentive Flow

1. **Stake** – operators lock `$AGIALPHA` in `StakeManager` under role `2`.
2. **Register** – `PlatformIncentives.stakeAndActivate` registers the operator in `PlatformRegistry` and `JobRouter`. When only registry membership is needed, `PlatformRegistry.stakeAndRegister` or `acknowledgeStakeAndRegister` handle staking and registration without touching `JobRouter`.
3. **Routing** – `JobRouter` forwards jobs using scores from `PlatformRegistry`, giving higher probability to addresses with greater stake or reputation.
4. **Revenue Sharing** – job fees are sent to `StakeManager`, forwarded to `FeePool`, and distributed to operators according to `stake / totalStake` when `distributeFees()` is called.
5. **Withdraw** – operators call `FeePool.claimRewards()` to receive their share in `$AGIALPHA`.

The main deployer follows the same process but typically stakes `0`. With zero stake, the deployer:

- Appears in registries for demonstration but receives no routing preference.
- Claims rewards from `FeePool` and receives `0` tokens.
- Remains tax neutral because no fees accrue to its address.

## Pseudonymity & Governance

- No personal data is stored; addresses act independently and can rotate keys.
- Minimum stakes and optional blacklist controls mitigate sybil attacks while preserving pseudonymity.
- Optional governance modules such as `GovernanceReward` can grant voting bonuses to staked participants, further aligning incentives.

## Owner Upgradability

All modules are `Ownable`. The owner can:

- Adjust minimum stakes, slashing percentages and burn rates.
- Replace auxiliary modules like the reputation engine or dispute handler.
- Authorise helpers (`PlatformRegistry.setRegistrar`, `JobRouter.setRegistrar`).

These setters enable economic and architectural adjustments without redeploying core contracts.

## Compliance Notes

The incentive system is designed to minimise off‑chain reporting by distributing rewards on‑chain, but local laws still apply. Operators should monitor regulatory changes and self‑report earnings as required. The protocol provides no tax forms or KYC facilities and accepts no responsibility for individual compliance.
