# source-v2.1.0-rc.10 — percentage collateral and terminal reputation

This source and evidence prerelease combines the preserved demo work from PR #3967 (including #3935–3966), the percentage-collateral and owner-tooling work, and the reputation repairs in #3971 and #3972. The complete source is frozen at `91496bba7e80ffef2b86310ee6301655c441988d`, tree `3c5c4e256141f7a97acc358be6c929b999089629`. Original branch histories, design documents, diagrams, deployment records and earlier release notes remain available.

Production approval remains **false**. Publication requires successful independent review and every required check and observed main workflow on the exact final merged commit. A source prerelease does not authorize deployment, migration, funding or live settlement.

## Reputation corrections in freshly compiled source

Positive credit damps only the new award, preserves earned reputation and saturates at the cap. The historical high-score arithmetic panic is covered by regression and invariant checks. Explicit authorized penalties and blacklist policy remain available.

Registry payouts already use 18-decimal AGIALPHA base units; the extra `1e12` conversion is removed. Outcome scoring occurs once during atomic terminal settlement. Original validator reveal/vote facts and tally time survive cleanup and dispute reversal. Replays are rejected, employer delay does not add duration credit, and a reverting score hook rolls back funds, locks, outcome and processing together. Existing financial dispute treatment and separate forced-quorum faults remain unchanged; no new automatic agent-failure penalty is introduced.

Validation modules must expose `reputationInterfaceVersion() == 1`, including persistent reveal facts and deferred outcome scoring. The constructor and every configuration route reject older modules before job funding; replacement preflight checks the interface before broadcasting. Shared module `version()` remains 2. Registry delegates use `percentage-stake-v4`; Validation delegates use `terminal-reputation-v3`. Older delegate generations are rejected.

Historical prebuilt demo bundles remain preserved and still contain their original semantics, including the old reputation defect. They are laboratory history, not corrected deployment artifacts. **Do not deploy or commission those historical bundles.** Use only fresh, source-bound compiler output from the corrected release qualification. Existing deployed contracts and their obligations are not altered by a source release.

The [growth receipt](reputation-growth-correction-evidence.json), [historical terminal receipt](reputation-terminal-scoring-evidence.json) and [additive interface receipt](reputation-terminal-interface-evidence.json) identify their exact checkpoints and declared limits. The combined source retains the reviewed corrected contracts byte for byte.

## Percentage collateral

New jobs snapshot an owner-adjustable rate from 0 through 10000 basis points, default 1000 (10%). Required collateral is the ceiling of gross reward, excluding fees, times that rate divided by 10000. Later owner changes affect future jobs; existing job locks retain their creation snapshot. The general agent-eligibility floor remains separate from available collateral for concurrent jobs. Legacy fixed-stake configuration and incompatible delegates fail explicitly.

Owner tooling, console transport, demonstrations and redenomination planning use dimensionless basis points. Redenomination preserves the rate and recomputes rounded quotes from each reward in its own denomination. A reward cap of zero means unlimited; quotes that exceed contract widths are visibly unavailable. BigInt dry-run arithmetic preserves exact token units, admission minimums and existing locks.

## Retained software evidence and limits

The combined source passes 883 official Hardhat cases, 79 focused policy/demo cases, strict artifact binding and all 66 production size checks. Redenomination browser checks pass at desktop/mobile sizes, in French, with exact values, untrusted-text handling, missing-export recovery, diagram fallback and retained work handoff. Live external Mermaid loading was unavailable in that local check; no live-diagram execution is claimed.

The corrected reputation checkpoint separately passes 740 recursive v2 cases, 238 Foundry cases across 40 suites and seven adversarial cases using actual AGIALPHA bytecode and the actual committee on a disposable fork of mainnet block 26200139. Synthetic balance/supply adjustments, local identities and a local zero base fee are explicit fixtures. The local Forge executable is 1.7.1; hosted 1.4.4 remains a distinct mandatory check. The fork does not establish an exact owner deployment plan or independent buyer acceptance.

Solidity remains 0.8.37 with Cancun, via-IR, 200 optimizer runs and IPFS metadata. The source policy retains historical evidence and pins all protected transitions to the frozen combined source. Later changes outside that freeze are rejected. Newer ordinary branches retain strict source/dependency protection. Earlier release identities and assets are never replaced.

Jobs governance, treasury, tax, signer and deployment limits remain unspecified. No Alpha EOA choice is inferred for Jobs. Exact unsigned owner planning, complete owner-plan fork qualification, historical-obligation reconciliation, provider/worker commissioning and separately authorized live operation remain open. External audit and Sepolia are **NOT PERFORMED — OWNER-ACCEPTED OMISSION**; this does not waive a technical gate. Local checks and AI review are not an external security audit.
