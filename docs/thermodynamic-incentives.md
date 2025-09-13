# Thermodynamic Incentives

AGIJobsv0 distributes `$AGIALPHA` using a physics inspired free–energy model.
This document summarises how the on–chain modules interact and how parameters
can be tuned in production.

## Free–Energy Budget

Each epoch `RewardEngineMB` aggregates attested energy metrics from
`EnergyOracle` and computes the Gibbs free energy of the system

```
ΔG = (Value − Costs) − Tₛ · ΔS
budget = κ · max(0, −ΔG)
```

- **Value** – estimated economic value of completed work
- **Costs** – total token payouts during the epoch
- **ΔS** – change in system entropy reported by the oracle
- **Tₛ** – system temperature from `Thermostat`
- **κ** – scaling factor converting energy units to tokens

If `ΔG` is positive the epoch mints no additional tokens. Otherwise the negative
free energy determines the reward budget for all roles.

## Maxwell–Boltzmann Allocation

Participants are grouped by role.  Each role receives a percentage of the budget
(`65%` agents, `15%` validators, `15%` operators, `5%` employers by default).
Within a role, user weights follow the Maxwell–Boltzmann distribution

```
wᵢ ∝ gᵢ · exp((μᵣ − Eᵢ) / Tᵣ)
```

where `Eᵢ` is the total energy attributed to the user, `gᵢ` is the degeneracy
(number of contributions), `μᵣ` the role–specific chemical potential and `Tᵣ`
the effective temperature for that role.  The weights are normalised so rewards
sum to the role’s budget share.

## Reputation Feedback

After transferring rewards via `FeePool`, the engine calls
`ReputationEngine.update(user, -energy)` to penalise inefficient work.  Efficient
participants therefore gain more reputation per token than wasteful ones.  The
reputation system can blacklist users whose score falls below the configured
threshold, ensuring that repeated bad actors are removed from the market.

## Temperature Control

`Thermostat.tick` adjusts the global temperature based on three KPI inputs:
reward emission error, job backlog error and SLA error. Each KPI is multiplied
by a configurable weight set via `setKPIWeights`, allowing governance to
emphasise particular metrics when tuning the controller. Governance can also set
role‑specific temperatures with `setRoleTemperature` (and later remove them with
`unsetRoleTemperature`) to encourage or dampen participation in a given role.
When no override exists, `getRoleTemperature` falls back to the global system
temperature.  All temperature changes are constrained within the `[minTemp,
maxTemp]` bounds to prevent extreme rewards.
Higher temperatures flatten the Maxwell–Boltzmann curve so rewards are spread
more evenly across participants.  Lower temperatures sharpen the distribution,
concentrating rewards on low‑energy, highly efficient contributors.

## Governance Delay and Exit

Parameter changes for the reward engine and thermostat are queued through the
governance timelock, which is configured with a **7 day** delay. Agents and
validators who disagree with a proposed change may leave during this period by
calling `StakeManager.requestWithdraw` and, after the `unbondingPeriod`
expires, `StakeManager.finalizeWithdraw` to recover their stake before the new
settings take effect.

## Events and Monitoring

`RewardEngineMB` emits a `RewardBudget` event every epoch with the total budget
and distribution ratio, allowing off–chain services to monitor reward issuance
and verify that minted tokens track productive work.

## Further Reading

- [Reward settlement walkthrough](reward-settlement-process.md)
- [Universal platform incentive architecture](universal-platform-incentive-architecture.md)
- [Thermostat PID controller](../contracts/v2/Thermostat.sol)
- [Maxwell–Boltzmann weighting](../contracts/v2/libraries/ThermoMath.sol)
