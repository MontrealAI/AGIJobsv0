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

| Energy Used (kJ) | Reward Weight | Reputation Gain |
| ---------------- | ------------- | --------------- |
| 20               | 1.0×          | +5              |
| 10               | 1.8×          | +9              |

```mermaid
flowchart LR
    EO((EnergyOracle)):::oracle -->|attests Eᵢ,gᵢ| RE[[RewardEngineMB]]:::engine
    TH((Thermostat)):::thermo -->|Tₛ/Tᵣ| RE
    RE --> FP((FeePool)):::out
    RE --> REP((ReputationEngine)):::out

    classDef oracle fill:#dff9fb,stroke:#00a8ff,stroke-width:1px;
    classDef engine fill:#e8ffe8,stroke:#2e7d32,stroke-width:1px;
    classDef thermo fill:#fff5e6,stroke:#ffa200,stroke-width:1px;
    classDef out fill:#fdf5ff,stroke:#8e24aa,stroke-width:1px;

    class EO oracle;
    class RE engine;
    class TH thermo;
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

### Reward Settlement Process

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
