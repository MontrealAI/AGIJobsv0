# Omnigenesis Global Sovereign Symphony — Fixture Runbook

## Evidence scope

The existing Omnigenesis plan is accepted by the ASI Take-Off planning schema. It supplies initiative, budget and job descriptions to reports only. The shared TypeScript pipeline runs two fixed contract scenarios (job lifecycle and SystemPause), then separately bootstrapped thermodynamics and owner-report fixtures. It does not execute the Omnigenesis job list, resolve its participant handles, deploy its governance labels or deliver its physical projects.

`demo:asi-takeoff:local` is a separate Aurora launcher. It consumes `AURORA_MISSION_CONFIG`, not `ASI_TAKEOFF_PLAN_PATH`. Exporting the latter never turns a local Aurora replay into Omnigenesis execution.

## 1. Inspect without execution

Follow the [root setup](../../docs/START_HERE.md#reproduce-the-local-baseline) for the pinned toolchain. From the repository root:

```bash
bash demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/bin/omnigenesis-ci.sh
bash demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/bin/omnigenesis-ci.sh --help
bash demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/bin/omnigenesis-ci.sh --plan
```

Default/help prints usage. `--plan` only reads and analyzes the JSON; none of these commands starts a pipeline, compiles contracts, acquires demo locks or writes reports. You may pass an existing compatible scenario JSON after `--plan`.

The module Makefile also defaults to help. `make -C demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY plan` performs read-only analysis; its explicit `ci` target opts into rehearsal.

## 2. Explicitly choose a rehearsal

Illustrative offline reports, with no contract checks or transactions:

```bash
AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=true \
  bash demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/bin/omnigenesis-ci.sh --rehearse
```

For the shared contract rehearsal after separately preparing dependencies, explicitly set `AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=false` and use the same `--rehearse` command. This can compile contracts and runs disposable Hardhat fixtures. A successful run still does not execute the scenario jobs.

The wrapper performs only two pipeline calls:

1. `npm run demo:asi-takeoff`, with the selected `ASI_TAKEOFF_PLAN_PATH` and an isolated `ASI_TAKEOFF_REPORT_ROOT`.
2. `npm run demo:asi-takeoff:kit`, with the same resolved path passed through `--plan`, and explicit report, summary, bundle and log paths.

`--rehearse [PLAN [REPORT_ROOT]]` supports existing ASI scenario plans. A positional plan takes precedence over `ASI_TAKEOFF_PLAN_PATH`; otherwise the Omnigenesis plan is selected. Relative paths resolve from the checkout. Invalid/missing plans fail before locks, archival or npm. Keep source plans outside the output scope.

The only supported report target is `reports/localhost/omnigenesis-global-symphony`, or its equivalent absolute path. Its `localhost` segment is retained for compatibility; the TS fixtures use the in-process `hardhat` network, not a persistent localhost node. Conflicting network/scope settings and any external `ASI_TAKEOFF_REPORT_ROOT` override are rejected. This wrapper is not a mainnet launcher.

## 3. Review the exact outputs

The scope contains `summary.md`, `summary.json`, `dry-run.json`, `thermodynamics.json`, `mission-control.md`, `governance-kit.json`, `governance-kit.md`, `run-status.json`, `logs/` and `mission-bundle/`. The kit hashes files; directory listings are not recursive content hashes. The wrapper does not produce an Aurora mission receipt or an `omnigenesis-report.md` file.

- Confirm that the manifest's initiative and `plan` artifact path/hash match the selected plan.
- Read the evidence mode: offline reports must say `offline-fixture` and contain no performed checks; normal reports describe shared local fixtures.
- Confirm that planned scenario jobs remain labeled as context and that `productionApproved` and `settlementApproved` are false.
- Inspect errors and partial files. Exit zero and matching hashes establish neither scenario completion nor production approval.

The wrapper holds the existing repository/port locks and archives the entire previous scope to a unique `omnigenesis-global-symphony-previous-*/reports` sibling before creating fresh output. Hidden files and partial prior runs are preserved. Busy locks or unsafe report-directory components fail before archival. See [report preservation](../aurora/bin/LOCAL-REPORTS.md). Linux, Python 3 and readable `/proc` are required by the lock helper.

## 4. Separate operator work

Owner atlas/parameter surfaces, monitoring/sentinel validation, validator activity, pause drills, and publication are separate workflows in the [operator runbook](../../OperatorRunbook.md). They are not bundled by this wrapper and do not inherit verified authority from this scenario. Review their real CLI options, deployment, network, signer and authorization separately. The kit CLI has no `--car-path` upload option; archiving or publishing requires its own supported tool and explicit approval.
