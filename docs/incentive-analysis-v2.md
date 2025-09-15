# Incentive Analysis – AGIJobManager v2

AGIJobManager v2 restructures the marketplace around standalone modules and calibrates their incentives so honest behaviour is the dominant strategy for every actor.

## Roles and Stakes

- **Agents** lock collateral via `StakeManager` equal to a percentage of job reward.
- **Validators** stake separately and are randomly selected by `ValidationModule`.
- **Employers** escrow payouts in `JobRegistry` and may claim a share of slashed collateral on failure.

## Voting and Settlement

Validators follow a commit–reveal scheme and outcomes finalise by majority:

```mermaid
sequenceDiagram
    participant V as Validator
    participant VM as ValidationModule
    V->>VM: commit(hash)
    V->>VM: reveal(vote, salt)
    VM->>JR: result
```

Majority approval releases rewards; any minority can escalate to the `DisputeModule` by paying a dispute fee.

## Slashing & Redistribution

Slashing percentages exceed potential rewards. When misbehaviour occurs:

- A portion of the agent’s slashed stake reimburses the employer.
- The remainder routes to a treasury address, raising the system’s enthalpy and discouraging deviations.

## Reputation Dynamics

`ReputationEngine` adds or subtracts points per job outcome. Falling below owner‑set thresholds auto‑blacklists addresses, removing future earning opportunities.

## Statistical Physics Analogy

The protocol behaves like a thermodynamic system seeking minimum Gibbs free energy,
\[ G = H - T S \]
where:

- **H** (Hamiltonian) is stake at risk; high slashing raises the energy cost of cheating.
- **S** (entropy) stems from random validator selection and commit–reveal timing.
- **T** (temperature) is tuned via owner‑set parameters, weighting the impact of randomness.

Honest execution minimises \(G\); any attempt to cheat requires additional “energy” and is disincentivised.

## Nash Equilibrium

For Agents and Validators, expected loss from slashing outweighs any potential gain from collusion. Employers receive compensation when jobs fail, aligning incentives across roles. This configuration drives the system toward an equilibrium where cooperation is rational for all participants.

## Monte Carlo Calibration

A Monte Carlo sweep simulated agents and validators with efficiencies ranging from 50% to 90%. We varied burn percentages (0–20%) and fee percentages (0–10%) over 1,000 iterations per pair. Dissipation was measured as fees plus burned stake per 100 token job.

The search showed dissipation grows with both parameters. The lowest non‑zero deterrent came at **burnPct = 5%** and **feePct = 2%**, averaging roughly 2.26 tokens dissipated per job. These values balance economic security with minimal loss and are set as governance defaults.
