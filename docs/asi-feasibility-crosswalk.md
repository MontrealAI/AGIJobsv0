# α-AGI Meta-Agentic Feasibility Crosswalk

> **Audience:** Governance councils, protocol architects, and due-diligence teams that need
> a single reference showing how AGI Jobs v0 (contracts v2) satisfies the strategic
> requirements outlined in *Achieving ASI with Meta-Agentic Program Synthesis and α-AGI
> Architecture*.
>
> **Goal:** Map every ASI feasibility pillar to concrete code paths, operational runbooks, and
> CI controls that are already implemented in this repository so a production reviewer can
> verify deployment readiness without excavating the entire documentation set.

---

## 1. Collective second-order intelligence

The orchestrator stack exposes a planner → simulator → runner feedback loop that lets the
sovereign agent spawn and coordinate specialised workers on demand. The public API surfaces
missing inputs and receipts so non-technical owners can supervise autonomous execution without
writing code.

- `POST /onebox/plan`, `/simulate`, and `/execute` deliver the meta-agentic planning surface,
  and stream execution receipts for auditing.【F:docs/orchestration.md†L3-L28】
- Continuous learning artefacts (`records.jsonl`, sandbox reports, identity metadata) capture
  every outcome so the architect can observe, replay, and upgrade sub-agent behaviour.【F:docs/continuous-learning.md†L1-L52】

Together these surfaces satisfy the collective intelligence criterion by letting the sovereign
agent orchestrate many specialists while retaining a human-auditable trace.

## 2. Open-ended self-improvement

The learning pipeline captures energy use, success metrics, and spawn requests, then reclones or
re-trains agents as performance changes.【F:docs/continuous-learning.md†L6-L52】 Operators can trigger
`cloneEligibleAgents()` and `scripts/retrainAgent.ts` directly from the runbooks, feeding upgraded
identities back into the orchestrator without downtime.【F:docs/continuous-learning.md†L24-L58】
This recursive loop ensures the platform continuously improves—meeting the evolutionary program
synthesis mandate from the feasibility study.

## 3. Decentralised compute and fault tolerance

α-AGI nodes register through browser-ready runbooks and can adjust paymaster fees, refill gas
balances, and pause operations using managed keys only.【F:docs/node-operator-runbook.md†L1-L33】
Emergency controls fan out across the stack, letting governance halt JobRegistry, StakeManager,
ValidationModule, FeePool, ReputationEngine, and other modules in one transaction.【F:docs/system-pause.md†L1-L52】
This pairing of decentralised operators and on-chain circuit breakers addresses the requirement
for unlimited scaling with institutional safety rails.

## 4. Economic drive and alignment

`RewardEngineMB` distributes AGIALPHA using configurable Maxwell-Boltzmann weights, allowing
owners to rebalance kappa, temperature, role shares, and chemical potentials (`μ`) as policy
shifts.【F:contracts/v2/RewardEngineMB.sol†L13-L115】 Coupled with the Thermostat governor and
EnergyOracle attestations, the reward loop enforces the thermodynamic incentives and slashing
model described in the roadmap. The economic flywheel therefore stays configurable and provably
aligned with owner directives.

## 5. Governance and safety guardrails

`SystemPause` centralises emergency shutdown while requiring module ownership transfer and pauser
refresh before activation, giving the contract owner deterministic authority over platform risk
response.【F:docs/system-pause.md†L1-L60】 The owner control guides walk non-technical staff through
parameter edits, dry runs, Safe bundle generation, and audit log collection so every change is
pre-authorised and traceable.【F:docs/owner-control-non-technical-guide.md†L1-L60】 Together these
runbooks close the safety loop highlighted in the feasibility assessment.

## 6. Production CI enforcement (v2)

The `ci (v2)` workflow fans out into linting, Hardhat tests, Foundry fuzzing, coverage gates, and a
summary barrier that stays visible on every pull request. Branch protection requires all five job
contexts plus companion workflows for e2e, fuzz, webapp, and containers checks.【F:docs/v2-ci-operations.md†L1-L75】
The README re-states the same enforcement list and self-test commands so any reviewer can confirm
the checks before merging.【F:README.md†L17-L63】 A green pipeline therefore certifies that all
quality bars in the ASI roadmap remain enforced.

## 7. Owner authority over parameters

Owners adjust every configurable surface through JSON manifests and guided CLIs. The non-technical
control handbook mandates dry runs, diff previews, and artefact archiving before executing on-chain
transactions.【F:docs/owner-control-non-technical-guide.md†L12-L70】 Energy, reward, stake, and pause
settings are under direct owner control via the manifests consumed by scripts in `scripts/v2/` and
`npm run owner:*` commands documented across the owner control bundle.

## 8. Verification checklist

Run this bundle before approving production deployment or major parameter updates. It cross-references
existing runbooks and emits artefacts for the audit vault. Pair it with the [ASI feasibility verification suite](asi-feasibility-verification-suite.md)
to capture operator evidence alongside code references.

```bash
# 1. Sync and reproduce CI locally
npm ci
npm run format:check
npm run lint:ci
npm test
npm run coverage
forge test -vvvv --ffi --fuzz-runs 256

# 2. Confirm owner wiring and manifests
npm run owner:doctor -- --network <network> --strict
npm run owner:verify-control -- --network <network>

# 3. Exercise safety valves and observability
npm run pause:test -- --network <network> --json > reports/<network>-pause.json
npm run thermodynamics:report -- --network <network> \
  THERMO_REPORT_FORMAT=markdown THERMO_REPORT_OUT=reports/<network>-thermo.md
```

Store the generated JSON/Markdown outputs under `reports/` and attach them to the active owner
control ticket for triple verification alongside the CI run URL.【F:docs/production/deployment-readiness-index.md†L14-L61】

---

## 9. Document maintenance expectations

Follow the documentation maintenance playbook whenever the orchestrator, reward engine, or owner
CLI surface changes. Update this crosswalk in lockstep with code or policy changes so auditors can
trace every ASI feasibility pillar to live evidence without manual archaeology.【F:docs/documentation-maintenance-playbook.md†L1-L52】
