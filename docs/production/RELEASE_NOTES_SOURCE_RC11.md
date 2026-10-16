# source-v2.1.0-rc.11 — retained Alpha projects and corrected reputation

This source and evidence prerelease integrates the native Alpha project receiver from PR #3973 with the published reputation-corrected rc.10 source `5688875c15a37ddc2ce0e554ad109f27efdb456c`. Corrected contracts, percentage-collateral policy and compiler settings retain the reviewed `91496bba7e80ffef2b86310ee6301655c441988d` checkpoint, tree `3c5c4e256141f7a97acc358be6c929b999089629`. The receiver retains its separate immutable code selection `36957c229a52b0518db01c24d8fc0aa45e8ce476`; a historical receiver checkpoint is not a deployment approval. Original branch histories, all demo work, diagrams, deployment records and prior release notes remain available. The receiver branch's earlier rc.9 preparation notes are retained separately in [history](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.11/docs/production/history/RELEASE_NOTES_SOURCE_RC9_RECEIVER_PREPARATION.md); they are not the publication target.

Production approval remains **false**. Publication requires successful independent review and every required check and observed main workflow on the exact final merged commit. A source prerelease does not authorize deployment, migration, funding or live settlement.

## Complete owner-report corrections

The functional-source checkpoint is `b17e40f5272b22368d0cbfb93e36a8bc89b30921`,
tree `5c0c8beeab58dfa3f95d5f9ac32fc8ab2aebd105`. It normally integrates the
complete owner-report correction from PR #3977 with the retained-project source.
The three reports encode literal punctuation before Markdown parsing, preserving
backslashes, table cells, links, emphasis, HTML-like text and entity-like input as
literal values. Command Center adds deliberate severity formatting and line breaks
after escaping data. Importing the actual renderers stays inert; direct CLI help
and invalid-argument refusal remain available.

The existing mandatory owner-Markdown CI entry now runs all 43 actual
marked/jsdom renderer, CLI and import regressions plus targeted TypeScript checks.
Restoring the exact earlier `fd6b91a5` escaping algorithm causes 23 of those cases
to fail. The earlier implementation-string assertions are retained in Git history;
the current checks assess the rendered values and adjacent cells. The documented
retained-project command separately passes all 66 cases. Receiver-suite relocation
preserves the four original suites outside native Hardhat discovery, with mandatory
Node CI registration and actual discovery/command regressions.

The owner-report findings correspond to confirmed inherited CodeQL High alerts
#931, #932 and #936 (`js/incomplete-sanitization`) in the published rc.10 source.
The complete remedy's original `62a024a` PR scan reports no new alerts. That is
historical differential evidence; fresh full-head review and integrated/main scans
remain mandatory. No alert is dismissed or declared closed by these notes.

Contracts, compiler settings, economic behavior, dependencies, network settings,
Hardhat configuration, receiver source pins, original project bytes and retained
history remain unchanged by these corrections. The source record keeps dependency
baseline `7b21ce05b0b18b46162da66c2f528334101f6f40`, all 54 original transitions
and every original before-blob. The three reviewed renderer after-blobs change;
the new literal helper is an explicit 55th transition with absence at the baseline.
No protected path is exempted. The updated record and complete merged source
require fresh independent exact-head review and qualification.

## Continue a project with its evidence

- Import the native Alpha `successor-project/v1` dossier using the pinned native
  validator. Retain its exact UTF-8 bytes, project/cycle identity, earlier cycles,
  failed attempts and rejected reviews. Native result semantics are checked;
  recomputed outer checksums cannot authorize changed outputs.
- Compile seven bounded, unsigned **DRAFT** work orders with Jobs v0's actual
  compiler. Select the AGIALPHA allowance explicitly in exact 18-decimal base
  units. Every draft gets a positive amount and integer remainders are retained.
  Manager's **USDC** proposal price is a separate choice with no conversion.
- Execute the fixed JavaScript integer-CSV task, preserving every duplicate row
  and source unit. Append the full native mission record and result pack with
  actual elapsed time. Keep compute price and human time unmeasured, reviews
  absent and protected evaluation unresolved.
- Bind `agijobsv0.successor-public-data-work.v1` to the exact project/cycle,
  upstream bytes, source identity, explicit market/executor, native specification,
  selected allowance and compiled graph. This source-only project namespace is
  separate from the existing Python `agialpha.bounded-work-spec.v1` adapter.
- Provide a dependency-free browser module for the guided interface and a local
  CLI that refuses overwrites and unstable, oversized, special-file or symlink
  inputs. Stop at the 2 MB/eight-checkpoint limit without pruning history.
- Preserve Alpha's native source closure, Apache license and nested MIT compiler
  license/provenance, plus the actual Jobs compiler and receiver hash inventories.

A Manager wrapper requires an explicitly installed, separately reviewed native
Manager inspector. Imported files cannot choose code, providers or executable
checkouts. Fleet receives a separate bounded task and retains its local execution
and internal-check evidence. Its executor choice does not change the AGIALPHA
market, grant permissions or establish an unrelated independent reviewer.

See the [project continuity guide](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.11/integrations/alpha-agent/PROJECT_CONTINUITY.md)
for the API, CLI, supported public-data task and trust boundaries.

## Bind receipt observations to the exact project

The added read-only adapter first validates the native history, then fetches and
verifies the canonical JobRegistry lifecycle receipt. It checks chain, full
registry runtime pin, event, worker, confirmation depth and log provenance. It
reads the job at the same block and requires the exact committed project-work
hash, selected contract reward, delivered native-record digest and staking token,
including its actual 18 decimals. It rechecks the canonical block afterward.

The resulting attachment retains the complete transfer and observed event. It
creates no payout authorization or operational admission; payout reconciliation
remains false. Assignment, submission, validation and finalization remain distinct.
The focused new receipt tests use RPC doubles, including identical CSV attached
to different projects or prices, substituted results/tokens, wrong decimals and
reorgs. They do not constitute a new local-chain or live paid acceptance run.
Existing rc.8 disposable-chain evidence remains historical and unchanged.

## Reputation corrections in freshly compiled source

Positive credit damps only the new award, preserves earned reputation and saturates at the cap. The historical high-score arithmetic panic is covered by regression and invariant checks. Explicit authorized penalties and blacklist policy remain available.

Registry payouts already use 18-decimal AGIALPHA base units; the extra `1e12` conversion is removed. Outcome scoring occurs once during atomic terminal settlement. Original validator reveal/vote facts and tally time survive cleanup and dispute reversal. Replays are rejected, employer delay does not add duration credit, and a reverting score hook rolls back funds, locks, outcome and processing together. Existing financial dispute treatment and separate forced-quorum faults remain unchanged; no new automatic agent-failure penalty is introduced.

Validation modules must expose `reputationInterfaceVersion() == 1`, including persistent reveal facts and deferred outcome scoring. The constructor and every configuration route reject older modules before job funding; replacement preflight checks the interface before broadcasting. Shared module `version()` remains 2. Registry delegates use `percentage-stake-v4`; Validation delegates use `terminal-reputation-v3`. Older delegate generations are rejected.

Historical prebuilt demo bundles remain preserved and still contain their original semantics, including the old reputation defect. They are laboratory history, not corrected deployment artifacts. **Do not deploy or commission those historical bundles.** Use only fresh, source-bound compiler output from the corrected release qualification. Existing deployed contracts and their obligations are not altered by a source release.

The [growth receipt](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.11/docs/production/reputation-growth-correction-evidence.json), [historical terminal receipt](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.11/docs/production/reputation-terminal-scoring-evidence.json) and [additive interface receipt](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.11/docs/production/reputation-terminal-interface-evidence.json) identify their exact checkpoints and declared limits. The combined source retains the reviewed corrected contracts byte for byte.

## Percentage collateral

New jobs snapshot an owner-adjustable rate from 0 through 10000 basis points, default 1000 (10%). Required collateral is the ceiling of gross reward, excluding fees, times that rate divided by 10000. Later owner changes affect future jobs; existing job locks retain their creation snapshot. The general agent-eligibility floor remains separate from available collateral for concurrent jobs. Legacy fixed-stake configuration and incompatible delegates fail explicitly.

Owner tooling, console transport, demonstrations and redenomination planning use dimensionless basis points. Redenomination preserves the rate and recomputes rounded quotes from each reward in its own denomination. A reward cap of zero means unlimited; quotes that exceed contract widths are visibly unavailable. BigInt dry-run arithmetic preserves exact token units, admission minimums and existing locks.

## Retained software evidence and limits

The combined source passes 883 official Hardhat cases, 79 focused policy/demo cases, strict artifact binding and all 66 production size checks. Redenomination browser checks pass at desktop/mobile sizes, in French, with exact values, untrusted-text handling, missing-export recovery, diagram fallback and retained work handoff. Live external Mermaid loading was unavailable in that local check; no live-diagram execution is claimed.

The corrected reputation checkpoint separately passes 740 recursive v2 cases, 238 Foundry cases across 40 suites and seven adversarial cases using actual AGIALPHA bytecode and the actual committee on a disposable fork of mainnet block 26200139. Synthetic balance/supply adjustments, local identities and a local zero base fee are explicit fixtures. The local Forge executable is 1.7.1; hosted 1.4.4 remains a distinct mandatory check. The fork does not establish an exact owner deployment plan or independent buyer acceptance.

Solidity remains 0.8.37 with Cancun, via-IR, 200 optimizer runs and IPFS metadata. The source policy retains historical evidence and pins all protected transitions to the frozen combined source. Later changes outside that freeze are rejected. Newer ordinary branches retain strict source/dependency protection. Earlier release identities and assets are never replaced.

Jobs governance, treasury, tax, signer and deployment limits remain unspecified. No Alpha EOA choice is inferred for Jobs. Exact unsigned owner planning, complete owner-plan fork qualification, historical-obligation reconciliation, provider/worker commissioning and separately authorized live operation remain open. External audit and Sepolia are **NOT PERFORMED — OWNER-ACCEPTED OMISSION**; this does not waive a technical gate. Local checks and AI review are not an external security audit.

## Fresh exact-source publication

The twelve assets include the full source archive, exact compiler producer archive and provenance, compiler policy and guide, historical deployment/configuration evidence, recorded address book, deployment guide and these rc.11 notes. Every required context, configured workflow and observed main-push workflow must succeed on the exact merged source. Downloads must match source identity, producer, sizes and SHA-256 checksums before publication. Interrupted publication can resume only for the same snapshot; existing tags and published assets are never replaced. Published rc.10 remains unchanged. This release performs no transaction or operational activation.
