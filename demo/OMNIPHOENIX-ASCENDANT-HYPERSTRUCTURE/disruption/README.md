# Dependency disruption desk

A read-only, pre-commissioning decision aid for the supplied seven-job dependency plan.
It answers: which work becomes unreachable if a job is blocked, what rewards are exposed
as a planning total, which dependency subgraph remains unaffected, and how additional
job duration changes the earliest finite schedule. It does not simulate agent execution.

## Run

From repository root, Node 22 or later; no additional dependencies:

```sh
node demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/cli.cjs --help
node demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/cli.cjs
node --test test/scripts/omniphoenix-disruption.test.cjs
```

Defaults only read the original plan and print an analysis. Baseline: 1,128,000 planned
AGIALPHA rewards, 122,000 unallocated, and a 211-day illustrative critical path. The
original plan and diagrams are not modified.

Use `--plan FILE` for another bounded plan with the documented schema. Use `--controls FILE`
for a strict JSON object such as:

```json
{
  "delays": [{ "id": "PAN-PAYMENTS-NETTING", "days": 30 }],
  "blockedJobIds": [],
  "horizonDays": 211
}
```

That delay changes the critical dependency at infrastructure regeneration and extends
full completion from day 211 to 214. A 20-day delay to the same job instead fits within
that branch's schedule slack and leaves full completion at day 211.

Blocking `CLIMATE-SWARM-DEPLOY` also blocks `INFRA-REGEN-DEPLOY` and
`EQUILIBRIUM-REBALANCE`: planning reward exposure is 590,000; the remaining schedulable
subgraph finishes at day 71. Full completion and its delta are unknown (`null`), not 71.

## Export and reopen

```sh
node demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/cli.cjs --controls controls.json --output-dir ./new-disruption-run
node demo/OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/cli.cjs --import ./new-disruption-run/recovery.json --json
```

Output requires an explicitly requested, nonexistent directory with an existing real
parent. Existing destinations and symbolic-link parent aliases are rejected. Source
inputs must be regular files, bounded before reading, and not symbolic links. Nonblocking
open rejects FIFOs and other special files without waiting for a writer. Output
contains compact `report.json` and `recovery.json`, followed by a `completion.json` marker. Recovery preserves
exact UTF-8 source text and recomputes all results before accepting the stored report.
Neither a checksum nor successful import proves that the plan is authoritative.

## Interpretation and limits

- `deadlineDays` is assumed to mean duration after all dependencies, with unlimited
  parallel resources. This is not a commitment or a resource-constrained schedule.
- Delays add duration; blocking has no assumed recovery date. Causal chains show
  dependency reachability, including delays absorbed by schedule slack.
- Blocked reward exposure is an exact planning total, never lost, earned or paid money.
- Physical capacity, deployment feasibility and real-world impact are unknown.
- Source identities, governance instructions, energy budgets and reporting paths are
  validated metadata only. No identities, network connections or transactions are created.
- Strict UTF-8 JSON rejects duplicate decoded keys, BOMs, unknown fields, malformed or
  nonintegral numeric tokens, unsafe integers and invalid graph references.
- Limits apply before arithmetic/traversal: 256 KiB plan, 100 jobs, 365,000 days per
  original/combined duration, delay and horizon, and uint256 fixed-point token totals.
  Causal-chain expansion is capped at 1 MiB while traversing; complete compact recovery
  is capped at 4 MiB before returning any report. Inputs are never truncated or rounded.

See [CONTRACT.md](CONTRACT.md) for the stable JSON/browser integration contract.

### Interrupted exports

A complete export has a valid `completion.json` written last, matching both file hashes.
The CLI module's `readExportDirectory(path)` requires that marker, checks both files, and
recomputes recovery before classifying an export as complete. Standalone recovery-file
import remains supported and always recomputes its report.

Caught write failures remove only files created by this attempt whose identity still
matches, then remove its empty directory so the same destination can be retried.
If cleanup cannot finish, the error says so and preserves unrelated files. A process
crash or forced termination can leave incomplete output; a missing, invalid or mismatched
completion marker means it is not a complete export. Inspect such output or use a new
directory. Publication is not atomic and no crash-durability guarantee is made.
