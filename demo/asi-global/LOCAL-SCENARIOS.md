# Zenith local shared-scenario contract

The Zenith Sapience, Celestial Archon, Omnidominion, and Planetary OS `:local`
wrappers use the same ASI Global contract-lifecycle fixture by default:
[`config/mission@v2.json`](config/mission@v2.json). Their distinct report scopes
and titles identify the launcher, not four different executed project plans.

The default fixture contains **Renewable Capacity Surge**, **Climate Resilience
Mesh**, and **Governance Synchronisation**. Aurora exercises local job creation,
staking, validator commit/reveal, finalization, and settlement. Its simulated
identities, token, results, and physical-project descriptions are fixtures.
Contract receipts do not establish renewable construction, climate interventions,
or execution of the branded programmes described by a Zenith project plan.

## Design plans and mission inputs

Each branded `project-plan.json` is retained as design context. The non-local
governance-kit wrappers pass it to `scripts/v2/asiGlobalDemo.ts`, which reads it
for reporting and packaging. Those plan jobs are not the input to the local
Aurora lifecycle or its commissioning checks.

The branded plans lack the local mission's per-job specification, validator
quorum, stake, and result bindings. There is no implicit conversion or fallback
that runs those plans as an Aurora mission. The four local wrappers reject any
caller-supplied `ASI_GLOBAL_PLAN_PATH`, including an explicitly empty value,
before acquiring a lock, archiving reports, invoking Node/npm, or starting a
chain. Unset this variable rather than treating a successful shared-fixture run
as evidence that an ignored plan ran.

## Supported local override

`AURORA_MISSION_CONFIG` remains supported. An unset or empty value selects the
shared default; a nonempty value is forwarded unchanged through
`asi-global-local.sh` to `asi-takeoff-local.sh`. Relative paths are resolved from
the repository root. Supply an Aurora mission config with valid `jobs`, readable
`specPath` files and their validation quorums, and the required lifecycle inputs
as illustrated by the shared fixture. Pointing this variable at a branded plan
does not make it executable.

For example, after reviewing a compatible local mission file:

```bash
unset ASI_GLOBAL_PLAN_PATH
AURORA_MISSION_CONFIG=/absolute/path/to/reviewed-mission.json \
  npm run demo:zenith-sapience-celestial-archon:local
```

The selected mission is used for mission preflight, Aurora execution, and
commissioning checks; invalid or incomplete missions fail rather than certify
the branded plan. These wrappers print the selected fixture path and label the
generated report as a contract-lifecycle fixture report. Review the actual
`receipts/mission.json` and per-job transaction evidence to determine what ran.

The existing [localhost ownership and locking rules](../aurora/bin/LOCAL-NODE-SAFETY.md)
and [report archival rules](../aurora/bin/LOCAL-REPORTS.md) still apply. This
configuration clarification does not add a live-network execution path.
