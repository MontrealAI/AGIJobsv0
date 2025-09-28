# Orchestrator Configuration Inventory

This inventory links every orchestrator configuration knob to the governance workflows described in the root [`README.md`](../README.md). Use it as a checklist when reviewing proposals or preparing change-control bundles.

## Environment-driven percentages

| Helper | Sources | Governance linkage |
| --- | --- | --- |
| `get_fee_fraction()` | `ONEBOX_DEFAULT_FEE_PCT` → `ONEBOX_FEE_PCT` → `config/job-registry.json:feePct` | Feed the same protocol fee used by `JobRegistry.setFeePool` into planner cost projections so governance can keep on/off-chain math aligned when tuning fee policy.【F:orchestrator/config.py†L64-L69】【F:config/job-registry.json†L2-L12】【F:README.md†L327-L345】 |
| `get_burn_fraction()` | `ONEBOX_DEFAULT_BURN_PCT` → `ONEBOX_BURN_PCT` | Mirrors the burn schedule that `FeePool.setBurnPct` enforces during the fee-handling workflow, keeping simulated runs faithful to governance decisions.【F:orchestrator/config.py†L72-L85】【F:README.md†L48-L57】 |

## Core protocol modules

| Config file | Key knobs | Governance workflow |
| --- | --- | --- |
| `config/job-registry.json` | Stake requirements, reward caps, lifecycle windows, fee and treasury wiring knobs, tax policy binding, acknowledger allowlist | Updated when governance runs the Job Registry wiring sequence (`setModules`, `setTaxPolicy`, `setTreasury`, etc.) during deployment or parameter changes.【F:config/job-registry.json†L2-L12】【F:README.md†L323-L345】 |
| `config/stake-manager.json` | Minimum stake, slashing splits, treasury/burn/validator percentages, unbonding window, auto-staking heuristics, wiring to other modules | Inputs for the StakeManager governance bundle that tunes stake levels, slashing and dispute connectivity before handing control to the multisig/timelock.【F:config/stake-manager.json†L2-L35】【F:README.md†L326-L343】【F:README.md†L361-L368】 |
| `config/fee-pool.json` | Stake manager binding, reward role, burn percentage, treasury allowlist, governance/pauser targets, downstream rewarders | Referenced when executing the fee-handling workflow to align `FeePool` with treasury policy and pauser governance expectations.【F:config/fee-pool.json†L2-L10】【F:README.md†L48-L57】【F:README.md†L361-L368】 |
| `config/reward-engine.json` | Thermodynamic role shares, chemical potentials (`mu`), baseline energy, settlement cap, thermostat feed, settlers allowlist | Governs the reward rebalancing playbook that directs updates via `scripts/v2/updateThermodynamics.ts` and related governance proposals.【F:config/reward-engine.json†L2-L21】【F:README.md†L52-L58】 |
| `config/thermodynamics.json` | RewardEngine mirror plus thermostat PID weights, bounds and role temperatures | Drives the thermodynamic incentive retuning workflow, ensuring on-chain controller updates match the documented operations guide.【F:config/thermodynamics.json†L2-L39】【F:README.md†L52-L58】 |
| `config/platform-registry.json` | Minimum platform stake, module addresses, pauser and registrar lists | Supports governance routines that onboard/blacklist platforms while maintaining pause coverage before ownership transfer.【F:config/platform-registry.json†L2-L8】【F:README.md†L361-L368】 |
| `config/platform-incentives.json` | Stake manager, platform registry and job router bindings | Couples platform incentive scripts to the deployment wiring workflow highlighted in the step-by-step deployment section.【F:config/platform-incentives.json†L2-L4】【F:README.md†L337-L345】 |
| `config/randao-coordinator.json` | Commit/reveal windows and stake deposit sizing | Aligns with dispute and validation governance that defines randomness windows for validator coordination prior to enabling modules.【F:config/randao-coordinator.json†L2-L8】【F:README.md†L327-L343】 |

## Identity and address books

| Config file | Key knobs | Governance workflow |
| --- | --- | --- |
| `config/identity-registry*.json` | ENS roots, Merkle overrides, reputation/attestation bindings, emergency allowlists | Maintains the ENS identity workflow (`npm run identity:update`) and emergency allowlists governed by Identity policy procedures.【F:config/identity-registry.json†L2-L20】【F:README.md†L32-L38】【F:README.md†L344-L346】 |
| `config/ens*.json` | Registry/NameWrapper/ReverseRegistrar addresses plus per-root metadata, hashes and alias mapping | Mirrors the ENS registration duties that governance verifies against deployments when wiring the IdentityRegistry.【F:config/ens.json†L2-L34】【F:README.md†L344-L346】 |
| `config/agialpha*.json` | Canonical token metadata, burn address, governance addresses, module wiring | Used during `$AGIALPHA` compile/verify workflows and during wiring verification to keep deployment addresses aligned.【F:config/agialpha.json†L2-L22】【F:README.md†L40-L47】【F:README.md†L347-L352】 |

## Telemetry, energy and safety rails

| Config file | Key knobs | Governance workflow |
| --- | --- | --- |
| `config/hamiltonian-monitor.json` | Observation window, reset controls, seeded records | Supports the Hamiltonian monitor upkeep process executed via `updateHamiltonianMonitor.ts` to keep economic telemetry tuned.【F:config/hamiltonian-monitor.json†L2-L5】【F:README.md†L89-L97】 |
| `config/energy-oracle.json` | Authorised signer roster, retention policy | Drives the energy oracle signer management workflow that reviews diffs before execution.【F:config/energy-oracle.json†L2-L3】【F:README.md†L99-L107】 |
| `config/thermodynamics.json` (thermostat block) | Temperature bounds, PID gains, KPI weights | Directly informs thermostat adjustments executed under the thermodynamic governance runbook.【F:config/thermodynamics.json†L21-L39】【F:README.md†L52-L58】 |
| `config/sandbox-tests.json` | Quality guardrail definitions (success-rate windows, reward floors) | Used by sandbox smoke-test workflows that governance monitors before enabling production changes.【F:config/sandbox-tests.json†L1-L13】【F:README.md†L190-L200】 |

## Policy and tooling controls

| Config file | Key knobs | Governance workflow |
| --- | --- | --- |
| `config/tax-policy.json` | Tax policy URI, acknowledgement text, allowlist management | Part of the tax-policy deployment workflow and multisig approvals when refreshing acknowledgements.【F:config/tax-policy.json†L1-L5】【F:README.md†L337-L345】【F:README.md†L117-L118】 |
| `config/policies.default.json` | Tool allow/deny lists, validator requirement, spend budget | Feeds governance reviews of orchestrator automation privileges before executing plans via the planner/simulator contract.【F:config/policies.default.json†L1-L7】【F:routes/meta_orchestrator.py†L34-L60】 |
| `config/tools.registry.json` | Tool catalog with budgets and enablement flags | Checked during One-Box UX governance reviews to ensure only approved automation tools are active.【F:config/tools.registry.json†L1-L8】【F:README.md†L30-L31】 |
| `config/agents.json` | Curated agent cohorts with energy weights | Audited alongside reward distribution governance to keep offline planner heuristics aligned with identity policy outcomes.【F:config/agents.json†L1-L16】【F:README.md†L32-L38】【F:README.md†L52-L66】 |
| `config/owner-control.json` | Default governance/owner targets and module-specific ownership models | Powers the owner-control playbook that ensures each module transfers to multisig/timelock governance with the right interface (governable/ownable/ownable2step).【F:config/owner-control.json†L1-L30】【F:README.md†L361-L377】 |

