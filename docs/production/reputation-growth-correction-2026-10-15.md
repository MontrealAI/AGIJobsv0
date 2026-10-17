# Reputation growth correction — 2026-10-15

Current source status (October 16): this repair and the later
[producer/terminal-scoring correction](reputation-terminal-scoring-2026-10-15.md)
are merged in `source-v2.1.0-rc.12`
(`b936efe066dc1b1f7a2fcc18ab9950d77cdf96d5`). The observations and remaining gates
below describe this earlier checkpoint; its two producer/terminal defects were
subsequently corrected. Source publication does not qualify the new Mainnet
signing workflow. Previous deployments remain outside its mutation scope;
historical obligations are not a prerequisite to a separate new deployment.

The inherited engine reattenuated the entire accumulated score when applying
positive credit. After an authorized 20,000-point award produced a score of
19,036, an additional one-point award or successful finalization could reduce
the calculated score and underflow `newScore - current`. The exception rolled
back job settlement, including payout and collateral release.

This correction applies the existing damping factor to incoming credit only,
bounds the award before arithmetic, and saturates the final score at 88,888.
The exact arithmetic, integer rounding and examples are in the
[API documentation](../api/ReputationEngine.md). No ABI, storage field, caller
authorization, explicit penalty, blacklist rule, or collateral policy changes.
This changes positive-credit economics and requires independent review.

## Regression scope

The new high-reputation case in `test/v2/JobStakeLifecycle.test.js` failed before
the fix with panic `0x11` through `JobRegistrySettlement._finalize` and the
actual `ReputationEngine._finalizeAgent`. It uses the actual modular Registry
and StakeManager, a mock token and identity registry, and a validation stub.
The repaired path must pay 101 base units, release the recorded 11-unit job
collateral, retain the 500-unit general deposit, preserve the 19,036 reputation
score on a zero-point award, and reject a second finalization without paying
or releasing again. This is executed local settlement, not mainnet activity.

Engine regressions cover zero and small credit, repeated successful work,
high-score validator credit, maximum unsigned awards, cap saturation, explicit
penalties, rehabilitation and unauthorized callers. Foundry properties exercise
monotonic scores, bounded growth, award ordering and sequences through actual
engine code. The historical bundle check pins its SHA-256 and reproduces its
old panic alongside the corrected compiled engine. Historical bundle bytes
remain unchanged.

The pinned mainnet-fork drill also executes both the original happy path and a
high-reputation worker settlement against actual AGIALPHA runtime code. It uses
synthetic local balances and supply deltas, local ENS/identity fixtures and a
validation stub. It verifies chain 1 and the selected block/hash before writes,
preserves token code, checks collateral and wallet accounting, rejects repeat
settlement and completes the certificate purchase. It is a partial local fork
rehearsal; it does not establish full-committee validation, corrected payout
units, exact owner-plan execution or independent buyer acceptance.

The native Solidity 0.8.37 build, strict source/artifact/diagnostic policy and
runtime/initcode size gate pass. The corrected engine runtime is 7,015 bytes;
its ABI and all 13 storage fields match the prior candidate. The focused suite
passes 33 cases and the official Hardhat suite passes 873 cases. Detailed source
and output hashes, further regression totals and limitations are recorded in
[the additive evidence receipt](reputation-growth-correction-evidence.json).

`scripts/diagnostics/reputation-growth-fixed.cjs` checks historical versus fresh
code in an explicitly guarded disposable local EVM. The original reproduction
and original blocker receipt are retained as historical evidence against their
recorded source revision; their failure assertion is not a success criterion
for repaired source.

## Remaining deployment gates

This closes the positive-growth arithmetic defect only after the recorded
checks pass. It does not qualify deployment. The following remain open:

- Review and correct producer payout units: Registry and ValidationModule
  currently multiply 18-decimal agent payout by `1e12` before reputation hooks.
- Review terminal exactly-once scoring: validation can score before final
  settlement, and dispute reversal clears the processed flag without undoing
  the earlier score. Repeat-finalization rejection alone does not resolve this.
- Independent review, exact-head hosted gates, exact unsigned owner deployment
  plan, complete fork/adversarial lifecycle evidence, and historical obligation
  reconciliation remain required. Owner/configuration choices remain unset.
- External audit and Sepolia rehearsal: **NOT PERFORMED — OWNER-ACCEPTED
  OMISSION**. These omissions do not waive any technical defect or signing gate.

No external transactions, signatures, funding or privileged host changes were
performed. The historical source release and prebuilt demos are not relabeled
as repaired or deployment-approved.
