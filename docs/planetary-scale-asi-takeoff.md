# Planetary-scale ASI Takeoff planning and rehearsal

The original [planetary mission plan](../demo/asi-takeoff/project-plan.planetary.json) describes regional energy analysis, a swap ledger and liquidity execution. It remains a conceptual scenario. The demo does not operate a power grid, construct solar fields, execute live swaps or establish authority over regional institutions.

## Inspect the plan first

```bash
npm run demo:asi-takeoff:studio
npm run demo:asi-takeoff:plan -- planetary --json
```

Choose **Planetary energy coordination** in the studio. The declared budget is 780000 AGIALPHA; five planned rewards total 680000, leaving 100000 unallocated. These are scenario token amounts, not fiat expenditure.

For the planning exercise, `deadlineDays` is explicitly treated as duration after dependencies with unlimited parallel resources. This yields a 41-day critical path against the objective's 30-day horizon. The plan's original deadline semantics are not an executable resource schedule; clarify them and revise the plan before commissioning work. The studio exposes this conflict without rewriting the original vision.

## Governance reports with planetary context

After the [pinned repository setup](START_HERE.md#reproduce-the-local-baseline):

```bash
ASI_TAKEOFF_PLAN_PATH=demo/asi-takeoff/project-plan.planetary.json ASI_TAKEOFF_REPORT_ROOT=reports/asi-takeoff-planetary npm run demo:asi-takeoff
```

This invokes the actual plan-aware report pipeline. It writes `summary.md`, `summary.json`, `dry-run.json`, `thermodynamics.json`, `mission-control.md`, logs, a mission bundle, a governance kit and a run-status marker inside `reports/asi-takeoff-planetary/`. It does not use the historical `.planetary` filenames listed in the plan's reporting metadata. The plan supplies context to the existing lifecycle harness; its five jobs are not dispatched.

`npm run demo:asi-takeoff:local` is a different rehearsal, driven by the three-job agriculture/infrastructure/healthcare mission. `ASI_TAKEOFF_PLAN_PATH` does not change that launcher. `demo:asi-takeoff:report` rebuilds its saved localhost receipt report, not the planetary pipeline summary.

## Deterministic contract integration test

`test/v2/planetaryTakeoff.integration.test.ts` retains the planetary contract fixture. With the full toolchain installed:

```bash
npx hardhat test test/v2/planetaryTakeoff.integration.test.ts
```

The test exercises staking, tax acknowledgements, configured work submissions, a validation stub, owner pause/unpause, fee changes, treasury accounting and reputation effects. Stub validation is not independent assessment of energy forecasts or physical delivery. Local contract tests do not establish live economic performance or audit sign-off.

## Commission reviewable computer work

The [planetary computer-work task](../demo/asi-takeoff/computer-work/task.json) makes the planning discrepancy a concrete deliverable: exact budget reconciliation, the full dependency schedule and a written dossier. It embeds the approved synthetic source hash and defines independently checked acceptance criteria. OpenClaw's existing Responses adapter or an operator-led ChatGPT Work session can produce candidate files; the [demo README](../demo/asi-takeoff/README.md#computer-work-a-concrete-acceptance-contract) explains the handoff.

Independent acceptance, deployment authority and final settlement remain separate. Preserve evidence and reconcile interrupted/unknown worker outcomes before another admitted attempt. The original systems flowchart, scenario and vision presentation remain intact.
