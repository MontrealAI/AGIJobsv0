# Reputation producer and terminal-scoring correction — 2026-10-15

This candidate builds on the separately recorded positive-growth repair. It
remains unmerged and is not deployment-approved. Earlier source releases,
prebuilt demo bundles and qualification receipts remain unchanged.

Registry payout amounts are already 18-decimal AGIALPHA base units. The old
extra `1e12` conversion inflated the engine's payout input. Settlement now sends
the actual agent amount, after the existing validator deduction and agent
percentage, without that conversion. Dispute financial treatment, percentage
collateral snapshots, separate general eligibility floor and fee policy are retained.

Normal validation tally records the outcome and a separate reputation snapshot
of each validator's original reveal/vote. It does not award outcome-dependent
reputation. The snapshot survives validation cleanup and dispute reversal even
when the existing financial committee is cleared. Terminal Registry settlement
applies the existing engine policy against the final outcome, marks processing
and clears the temporary snapshot atomically with funds. Repeat settlement is
rejected. A reverting score hook rolls the whole transaction back.

The snapshot records the original tally timestamp. Employer delay after tally
or during a dispute does not add duration credit. Governance resolution of an
untallied job keeps the existing settlement-time fallback. The separately
observable forced-quorum non-reveal fault remains under its existing rule; it
is not applied again at settlement. No new automatic agent-failure penalty is
introduced: a failure still passes zero payout and zero duration to the engine.

The old validator marker remains ABI-compatible but rejects early scoring.
A Registry-only self-call routes score processing through its fixed lifecycle
delegate to preserve the settlement module's production size budget. External
callers cannot invoke it. All Registry delegate IDs advance to
`percentage-stake-v4`; Validation delegate IDs advance to
`terminal-reputation-v3`. Mixed preceding delegate generations are rejected.
The Registry requires a separate `reputationInterfaceVersion() == 1` from
validation modules at construction and every configuration route. Older modules
are rejected before jobs can be funded, including third-party modules without
`revealed()`. Global module `version() == 2` stays compatible with shared staking
wiring. Replacement preflight enforces the new interface before broadcasting.

One mapping is appended after the percentage field; every earlier storage slot
and controller signature remains compatible. Historical bundles are hash-pinned
and retain their original semantics; they are not relabeled as corrected code.

## Observed local checks and open gates

The actual Registry, StakeManager, ReputationEngine, ValidationModule and
DisputeModule pass seven new committee cases: approval, both dispute reversals,
partial reveal, forced-quorum non-reveal, forbidden early/self-call routes and
atomic rollback when the scoring hook rejects.
They also check native payout units, 30,000 seconds of delayed settlement,
retained vote facts, payout/collateral accounting and repeat-finalization
rejection. The default cases use declared local token and identity fixtures. The fork
mode below uses the actual token runtime with a local identity fixture; neither
mode constitutes mainnet execution or independent buyer acceptance.

The compatibility follow-up source `e646acf4765a27bb61b0caccea12fc05917e57d1` (tree `cd345cab6702d8c623571408f843710c60798161`) passes
883 official Hardhat cases, 740 recursive v2 cases across 150 tracked JavaScript
and TypeScript files, and 238 Foundry cases across all 40 suites, without
failures or skips. Its 36 focused compatibility, migration, storage/ABI and
committee cases pass. The seven committee scenarios also pass against actual
AGIALPHA bytecode at block 26200139, using the expected block hash and unchanged
token code, synthetic balances/supply delta, local identity fixtures and a local
zero-base-fee rehearsal. This is stronger joint token/committee evidence; an
exact owner-plan rehearsal and independent buyer acceptance remain open.

Canonical Solidity 0.8.37 with via-IR, 200 optimizer runs, Cancun and IPFS
metadata passes strict source/artifact binding, diagnostics and all 66
production runtime/initcode size checks: zero project warnings and 13 reviewed
upstream warnings. Lifecycle runtime is 23,274 bytes; settlement is 20,913.
The local Foundry executable is 1.7.1; hosted 1.4.4 remains a separate gate.
The older review of `4164b4c23e78a71ff7d543f1cacac6be42c5a5d2` does not qualify
the changed interface guard. Its [historical receipt](reputation-terminal-scoring-evidence.json)
remains unchanged; the [additive compatibility receipt](reputation-terminal-interface-evidence.json)
binds the new source, tests and log hashes. Fresh independent review remains required.

The inherited Cypress journey now selects the percentage setter, verifies
1500-bps transport without token scaling, rejects the retired option and
renders the 10% snapshot. Both equivalent actual Chromium journeys pass with
a declared mocked backend; the updated Cypress specs pass formatting and
TypeScript checks. The local Cypress download returned unavailable HTML, so
no local Cypress execution is claimed. Fresh hosted qualification, Cypress
and review remain mandatory for the final combined head. The compatibility receipt records the current source and retains the prior receipt identity.

Owner/governance, treasury, tax, signer and deployment limits remain unset.
No Alpha EOA setting is inferred for Jobs. Exact unsigned deployment planning,
complete actual-token fork/adversarial lifecycle qualification, historical
obligation reconciliation and separately authorized commissioning remain open.
External audit and Sepolia rehearsal are **NOT PERFORMED — OWNER-ACCEPTED
OMISSION**; neither omission waives a technical defect or signing gate.
No signatures, external transactions, funding or privileged host changes occur.
