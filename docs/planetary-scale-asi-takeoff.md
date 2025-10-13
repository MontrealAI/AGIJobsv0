# Planetary-Scale ASI Take-Off Demonstration

The planetary take-off drill exercises AGI Jobs v0 (v2) as a **planetary energy
coordinator**. It composes regional agents, validator quorums, and the existing
staking, validation, dispute, and reward engines to rebalance global power
supply within a single deterministic CI run. No new contracts are required – we
reuse the production-hardened v2 modules and surface their control levers so the
governance owner can halt, retune, or redeploy every subsystem during the
simulation.

## Scenario footprint

| Component | Source |
| --- | --- |
| Mission plan | `demo/asi-takeoff/project-plan.planetary.json` |
| CI integration test | `test/v2/planetaryTakeoff.integration.test.ts` |
| Demo pipeline | `scripts/v2/asiTakeoffDemo.ts` (override via `ASI_TAKEOFF_PLAN_PATH`) |

The mission starts with three continental agents producing surplus/deficit
intelligence, escalates to a planetary planner that synthesises a tokenised swap
ledger, and closes with automated liquidity execution. Validators earn the right
to approve every critical transition through the familiar dispute hooks, while
the fee pool accrues treasury revenue to the owner-controlled address.

## How to run locally

1. Export the planetary plan so the orchestration script consumes the global
   scenario artefact:

   ```bash
   export ASI_TAKEOFF_PLAN_PATH=demo/asi-takeoff/project-plan.planetary.json
   npm run demo:asi-takeoff:local
   ```

2. Collect the deterministic mission report:

   ```bash
   npm run demo:asi-takeoff:report
   ```

   The pipeline emits `summary.planetary.md`, `thermodynamics.planetary.json`,
   and `mission-control.planetary.md` under `reports/asi-takeoff/`.

## Continuous assurance

The integration test `planetaryTakeoff.integration.test.ts` deploys the full v2
stack on Hardhat and walks through the entire mission:

- Agents stake, acknowledge the tax policy, and deliver work products that are
  finalised via the validation stub.
- The owner exercises the pause/unpause controls before resuming normal
  operations.
- Validator rewards remain zero while protocol fees shift from 5% (regional jobs)
  to 8% (ledger execution), proving that fee governance updates apply only to
  subsequent work.
- Treasury routing, fee accrual, and reputation incentives are asserted for every
  participant.

The test is deterministic and CI-safe, ensuring any regression in the existing
contracts or scripts breaks the build.

## Operational guardrails

- **Full owner control** – the test demonstrates that the owner can pause the
  registry, update fee policy, and redirect treasury flows without touching the
  underlying contracts.
- **Audit-grade artefacts** – both the pipeline and integration test generate
  artefacts that align with the production mission structure, giving downstream
  auditors the same receipts they expect from live networks.
- **Planetary extensibility** – the plan file uses the same schema as the
  national rail initiative, so additional regions or validator cohorts can be
  introduced without code changes.

Together these assets deliver a CI-enforced, planetary-scale ASI take-off demo
that showcases national governance, economic rebalancing, and owner-operated
risk controls using only the repository’s existing primitives.
