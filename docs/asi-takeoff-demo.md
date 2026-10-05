# ASI Takeoff demonstration

The [ASI Takeoff README](../demo/asi-takeoff/README.md) is the entry point. Start its dependency-free local studio with `npm run demo:asi-takeoff:studio`, or inspect the planetary plan with `npm run demo:asi-takeoff:plan -- planetary`.

## Distinct execution paths

| Path | Input | Output and scope |
| --- | --- | --- |
| Planning studio / CLI | Original national or planetary project plan | Exact budget reconciliation and an explicitly assumed dependency schedule; no transactions or provider work |
| Computer-work exercise | Pinned synthetic planetary task | Candidate analysis/dossier, independent arithmetic review, separate substantive acceptance |
| `npm run demo:asi-takeoff` | Rail plan as summary context; existing lifecycle/report scripts | Local harness, separately bootstrapped thermodynamic/owner reports, summary and governance kit under `reports/asi-takeoff/` |
| `npm run demo:asi-takeoff:local` | `config/mission@v2.json` | Three configured mock-token job lifecycles and actual local receipts under `reports/localhost/asi-takeoff/` |

Changing a scenario plan does not dispatch its jobs or change the three-job local mission. A local contract receipt does not establish completion of a physical project or a live model run. Scenario owner/treasury labels and placeholder IPFS references are not verified deployment addresses or published deliverables.

## Governance pipeline

Complete the repository's [pinned setup](START_HERE.md#reproduce-the-local-baseline), then run:

```bash
npm run demo:asi-takeoff
```

It regenerates constants, compiles, runs `testnetDryRun.ts`, generates thermodynamic and mission-control reports, verifies owner wiring and builds a SHA-256 artifact index. The separate report processes use local fixtures; the bundle is not evidence of a single persistent deployment or production control authority.

Outputs are `dry-run.json`, `thermodynamics.json`, `mission-control.md`, `summary.{md,json}`, `mission-bundle/`, `logs/`, `governance-kit.{json,md}` and `run-status.json`. An interrupted/running status is not success; old files can remain after failure. Use separate report directories for separate runs.

`AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=true` produces **offline fixtures**, with `simulated`/`not-run` statuses. It performs no owner checks, chain transactions or provider execution. Generated files and hashes do not turn fixtures into validation evidence.

For the planetary variant and actual output routing, see [planetary-scale-asi-takeoff.md](planetary-scale-asi-takeoff.md). For local-receipt kit generation, optional Python/Make launchers and owner previews, follow the [runbook](../demo/asi-takeoff/RUNBOOK.md). Local receipts use `--local-receipts`; they do not contain the governance pipeline's dry-run/thermodynamics files.

## Assurance

The focused `demo-asi-takeoff` workflow checks planning, task acceptance, server and reporting regressions, Python launcher behavior, the full governance pipeline, the three-job local chain and its receipt kit. The root `ci (v2)` workflow also runs the governance demonstration. Check the exact PR head; historical green runs are not current verification.

The original flowchart and presentation remain available. Current OpenClaw, ChatGPT Work and API computer-use routes are documented in the demo README and [computer-work integration guide](computer-work.md), with task admission, independent evaluation and authorized settlement kept separate. The $40 trillion/year vision remains a project assumption, not a verified TAM or forecast.
