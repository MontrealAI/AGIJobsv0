# Dependency disruption desk contract v1

Planning before commissioning. No identities, providers, transactions, execution or settlement.
`deadlineDays` means duration after all dependencies; resources are unlimited and parallel.
Physical capacity and real-world impact are unknown. Exposed rewards are a planning total,
never lost, earned, paid or recoverable money.

Node API: `analyzeBytes(Uint8Array|string, controls?)` returns a report synchronously.
Controls (all optional): `{delays:[{id,days}],blockedJobIds:[id],horizonDays:null|integer}`.
Delays add integer duration to a job; blocked jobs and all their descendants cannot finish.
No duplicate IDs, duplicate keys, unknown keys, fractional numeric input, BOM or invalid UTF-8.
Bounds: plan 262144 UTF-8 bytes, 100 jobs, 365000 horizon/duration/delay days;
combined duration <=365000; amount strings <=78 integer digits, 18 decimals, uint256 scaled total.
Source metadata has an explicit accepted field schema; it is validated but not executed.

Report fields:

- schemaVersion:1; kind:'omniphoenix-dependency-disruption'; mode:'planning-only'
- sourceSha256: SHA-256 of exact accepted input bytes (including whitespace)
- reportSha256: SHA-256 of recursively key-sorted canonical JSON of report without this field
- controls: normalized, source-order delays and blockedJobIds; horizonDays
- assumptions: string array; liveProvider:false; transactionsSubmitted:false
- baseline: {currency,budget,allocatedRewards,unallocatedBudget,budgetWithinLimit,criticalPathDays,jobs}
  jobs use existing analyzer rows: {id,title,reward,dependencies,durationDays,startDay,finishDay}
- scenario: {completionPossible,criticalPathDays,criticalPathDeltaDays,finiteSubgraphCriticalPathDays,
  scheduleWithinHorizon,blockedJobIds,blockedDescendantIds,unaffectedJobIds,blockedRewardExposure,
  criticalPath,jobs}
  Full-plan criticalPathDays/delta and horizon result are null if any job is blocked.
  finiteSubgraphCriticalPathDays is the longest schedulable path, zero if none.
  jobs: {id,title,reward,dependencies,durationDays,status:'blocked'|'schedulable',startDay,finishDay,
  finishDeltaDays,blockedBy:[id],causalChains:[[id,...,jobId]],criticalPredecessor:null|id}
  Blocked timing and delta fields are null. blockedBy lists all blocked ancestors including self;
  causalChains includes one deterministic shortest dependency chain from each disruption origin
  (delayed or blocked, including self) to this job. A chain means dependency reachability, not
  that every delay changes finish time. unaffectedJobIds excludes all disruption origins/descendants.
  criticalPath is deterministic source-order tie-breaking and refers to finite subgraph.

Recovery API: `exportRecovery(sourceBytes, controls)` returns a JSON-serializable envelope:
`{schemaVersion:1,kind:'omniphoenix-disruption-recovery',sourceText,controls,report}`.
`importRecovery(bytes)` strictly parses bounded JSON, recomputes from exact sourceText and controls,
compares all report content canonically and rejects tampering; returns `{sourceText,controls,report}`.
Recovery max 4194304 UTF-8 bytes. Unknown envelope/report keys are rejected by recomputation equality.
A valid SHA-256 checksum proves consistency, not authenticity or authority.

Browser adapter: `createDesk({analyze,sha256})` in core.cjs returns the same synchronous APIs.
`analyze` is the existing demo/asi-takeoff/scripts/plan.cjs function; sha256 accepts Uint8Array and
returns lowercase hex. Node index.cjs wires the authoritative engine and node:crypto adapters.
All returned content is data: render with textContent, never as HTML. Do not expose unused source
identities/governance data or the existing analyzer's unrelated market field.

Additional structural bound: causal-chain expansion is checked during traversal against 1 MiB.
The complete compact recovery payload is capped at 4 MiB before any report is returned.
Inputs exceeding these output budgets fail explicitly; no report or recovery is truncated.
Use compact JSON for recovery exports; arbitrary indentation may exceed the import byte cap.

CLI directory exports write compact report.json and recovery.json, then completion.json
last. The marker records schemaVersion:1, kind:'omniphoenix-complete-export', and SHA-256
of each exact file in reportFileSha256/recoveryFileSha256. The CLI module exports
readExportDirectory(path), which requires and validates this marker and recomputes
recovery. Caught failures clean matching owned files only; crash leftovers can remain
incomplete. This is not atomic directory publication. Standalone recovery import does
not require a directory marker.
