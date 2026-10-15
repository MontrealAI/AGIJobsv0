# Omniphoenix Ascendant Hyperstructure

A bounded dependency-disruption desk, preserved scenario design and guide to shared ASI Take-Off fixtures. The plan's jobs, participant handles, governance labels and physical projects are illustrative context. These files do not establish deployed identities, completed work or production readiness.

## Dependency disruption desk

Open the EN/FR [browser workspace](https://montrealai.github.io/AGIJobsv0/experiments/omniphoenix/) after its reviewed Pages deployment, or run the read-only local entrypoint:

```sh
node demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/cli.cjs
```

Compare supplied delays and blocked jobs, inspect causal dependency chains and exact planning reward exposure, and export/reopen a recomputed analysis. The baseline has 1,128,000 planned rewards, 122,000 unallocated and a 211-day illustrative critical path. Duration means time after dependencies with unlimited parallel resources; physical capacity is unknown. Reward exposure is a planning total, never lost or earned money.

See the [runtime and recovery guide](disruption/README.md). This workspace performs graph and arithmetic analysis without commissioning jobs, creating identities or authorizing settlement. Browser and local exports preserve exact source bytes and distinguish source hashes from canonical report hashes.

## Separate shared fixture path

The existing runbook binds the scenario plan to the shared ASI Take-Off report pipeline.

Read the [runbook](RUNBOOK.md) and the [root setup](../../docs/START_HERE.md#reproduce-the-local-baseline). Use the pinned toolchain and locked dependencies. The plan remains in [project-plan.hyperstructure.json](project-plan.hyperstructure.json); no conversion to the Aurora mission schema is implied.

- `demo:asi-takeoff` reads `ASI_TAKEOFF_PLAN_PATH` for report context. Its normal mode runs fixed lifecycle/pause fixtures and separately bootstrapped reporting fixtures, not the scenario job list.
- `demo:asi-takeoff:local` is a different launcher. It uses `AURORA_MISSION_CONFIG`, defaults to the shared three-job `mission@v2.json`, and does not consume `ASI_TAKEOFF_PLAN_PATH`.
- `demo:asi-takeoff:kit -- --plan FILE ...` hashes the explicitly selected plan and supplied report files. It does not verify completed scenario work or ownership authority.

## Systems map — preserved original design

The original diagram describes the intended architecture, not execution evidence.

```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_OMNIPHOENIX_ASCENDANT_HYPERSTRUCTURE[[Demo → Omniphoenix Ascendant Hyperstructure]]
    demo_OMNIPHOENIX_ASCENDANT_HYPERSTRUCTURE --> Core[["AGI Jobs v0 (v2) Core Intelligence"]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Separate operator workflows

Owner-control changes, monitoring, validator operations, emergency drills and publication require their own configuration, evidence and authorization. See the [operator runbook](../../OperatorRunbook.md) and [ASI Take-Off runbook](../asi-takeoff/RUNBOOK.md). A successful fixture run does not authorize production operations.
