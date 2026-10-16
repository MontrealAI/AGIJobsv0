# Jobs terminal v3: full ValidationModule closure gas benchmark

## Bottom line

- The unchanged candidate Hardhat profile resolves to **Osaka, 30,000,000 block gas, and an independently confirmed 16,777,216 transaction gas cap**. The explicit cap probe rejected a zero-value local self-transaction requesting 16,777,217 gas.
- **100 and 256 selected validators cannot be formed by this fixture on the unchanged profile.** Each selection transaction requested 16,777,216 gas and reverted with status 0, empty revert data, and receipt gas 16,515,488. Do not use the diagnostic results below to qualify either size for that profile.
- The conservatively supported *tested configuration* is **3 selected validators**, with the default rotating strategy, sample size 100, max-per-job ceiling 100, 30-minute commit/reveal windows, unchanged Osaka gas settings, and the fixture dependencies described below. It passed with dense pools of 3, 100, and 256, plus a sparse 256-entry pool containing only 3 eligible validators. This is not an upper-bound proof or a live deployment recommendation.
- Full **100-member** closure was measured on a separately labeled Cancun diagnostic EVM. All five closure transactions used an actual **30M block ceiling** and a 30M transaction gas limit. Real selection first consumed 28,363,009 gas under a diagnostic 60M setup ceiling.
- Full **256-member closure is unmeasured**. One diagnostic real selection used 74,654,299 gas with a 100M setup ceiling; its subsequent process was killed (exit 137). A single sequential retry was stopped at its explicit 1.5 GiB memory budget. No closure number is extrapolated.

This is an ordinary functional benchmark, not a security review, canonical-CI pass, or deployment approval. No producer Solidity, existing tests, artifacts, external chains, forks, real funds, or published state were changed.

## Original-profile default-size measurements

All receipt values below are full transaction gas, including nested production module calls. `estimateGas` is recorded separately because storage refunds make receipt gas lower than execution headroom required.

| Selected | Pool / eligibility | Selection receipt gas | Profile |
|---:|---|---:|---|
| 3 | 3 / all eligible | 1,070,273 | Bare Validation constructor defaults |
| 3 | 3 / all eligible | 1,089,731 | Explicit protocol requiredApprovals=3 |
| 3 | 100 / all eligible | 11,185,647 | Bare Validation constructor defaults |
| 3 | 256 / all eligible | 11,165,783 | Bare Validation constructor defaults |
| 3 | 256 / only 3 eligible, all staked | 12,630,620 | Explicit protocol requiredApprovals=3 |

Small selection differences depend on the sampled order and generated local block randomness. There is one measured run per row, not a distributional upper bound.

For the explicit three-approval protocol setting:

| Full closure | Receipt gas | estimateGas |
|---|---:|---:|
| Early, all 3 approve | 567,604 | 722,809 |
| Early, 2 approve / 1 reject | 655,264 | 834,438 |
| Timeout, 2 reveal / 1 missing | 705,139 | 897,262 |
| Timeout, none reveal, finalize | 701,932 | 893,182 |
| Timeout, none reveal, forceFinalize | 623,040 | 793,403 |

The mixed case fails validation under requiredApprovals=3 and slashes the two approving validators as implemented. Both dense large-pool runs and the sparse-pool run also completed all-approved early closure (567,604 gas) and zero-reveal timeout finalize (701,932 gas).

### Defaults versus configurable ceilings

- `ValidationModuleBase`: default minValidators=3, maxValidators=5, validatorsPerJob=3, maxValidatorsPerJob=100, pool sample=100, max pool=1000, rotating strategy=0, approval threshold=66%, reveal quorum=67% with minimum3, earlyFinalizeDelay=300s, commit/reveal windows=1800s, force grace=3600s.
- The bare constructor automatically computes `ceil(3 * 66 / 100) = 2` required approvals. The generated protocol defaults separately specify **3**, as does the explicit local integration scenario in `scripts/deploy/providerAgnosticDeploy.ts`.
- `native-protocol-default3.json` sets the explicit three-approval protocol value while retaining the original EVM and remaining Validation defaults. This does **not** claim to deploy a complete production configuration: the inherited real-module fixture intentionally uses registry fee/reward percentages0, token burn0, employer-directed slashes, an allowlisted identity setup, and a mock token. Generated fee/burn defaults are 2%/6%; bare Registry fee/reward defaults are 5%/8%. Those differences are disclosed rather than hidden under a “production default” label.
- The large selected-committee fixture explicitly raises `validatorsPerJob` and pool sample to100/256; 256 also raises maxValidatorsPerJob. Those are diagnostic committee configurations, not defaults.

### Pool size and selection work

The default is `SelectionStrategy.Rotating`. Its loop condition is `i < n && candidateCount < sample`: sample100 bounds **accepted candidates**, not visited pool entries. The sparse case removed identity authorization from253 of256 positively staked accounts, preserving3 eligible accounts. With only3 accepted candidates, selection scans the entire256-entry pool; it still passed at12,630,620 gas here. Larger or differently ineligible pools were not measured, so the default max-pool setting1000 is not qualified by this test.

Selection also performs weighted sampling without replacement, with a nested candidate search, then persistent per-validator selection and stake-lock writes. The selected100/256 failures are therefore not simply a function of having100/256 registered addresses: selecting3 from those same pool sizes passed. The large tests increased both selected count and accepted sample size. No linear or quadratic extrapolated gas value is used as a measurement.

## Full 100-member closure: diagnostic Cancun only

Real selected committee100, pool100, sample100, 10 token units of stake per validator, reputation100 per validator; 100-token job reward. All validators made genuine commitment transactions. Early cases reveal all100; timeout cases have99 or0 reveals.

| Case | Receipt gas | estimateGas | Actual block / tx ceiling |
|---|---:|---:|---|
| Early, all approve | 11,598,231 | 14,761,036 | 30M / 30M |
| Early, 70 approve / 30 reject | 12,046,495 | 15,307,582 | 30M / 30M |
| Timeout, 99 approve / 1 missing | 11,676,712 | 14,861,816 | 30M / 30M |
| Timeout, zero reveals, finalize | 14,981,749 | 19,029,637 | 30M / 30M |
| Timeout, zero reveals, forceFinalize | 12,607,494 | 16,038,438 | 30M / 30M |

**Do not compare post-refund receipt gas alone against the Osaka transaction cap.** For example, the zero-reveal finalize receipt is14.98M but its gas estimate is19.03M. These are Cancun measurements; they do not establish equivalent Osaka closure success. Original-profile large committee selection is already blocked.

### Included work and verified state

The measured transaction begins at the public ValidationModule controller, executes the real fixed voting implementation, persists the full immutable committee snapshot in ReputationEngine, applies the existing non-reveal reputation decrement, performs real StakeManager/token slashing as applicable, writes the Registry validation result, unlocks stake, and clears round/commitment/vote state. No isolated storage-only Engine substitute is used.

- For every successful case, all selected validators' persisted Engine facts were checked individually against the submitted reveal/vote state, and every selected validator's stake lock was checked as zero.
- The mixed100 case transferred150 token units in slashes to the employer. The single-missing case transferred0.05. The all-missing cases transferred5 total; sampled validator stake became9.95 and reputation100 became99.
- Early closure receipts are strictly before the reveal deadline and have all selected validators revealed.
- In every non-reveal case, a read-only call at **exactly** revealDeadline reverted with `RevealPending` (selector0xb99f6e32). Actual finalize transactions are strictly later; forceFinalize is later than deadline+grace.
- A ValidationModule closure is **not the later terminal Registry monetary settlement**. Engine `settled` remains false here; later employer Registry.finalize and permissionless validator claim accounting are intentionally not bundled into this benchmark.

### Calldata and state sizes

- External selectValidators calldata:68 bytes. Every commit:228 bytes. Every reveal:292 bytes. Every closure:36 bytes.
- Committee3: recordRound ABI calldata612 bytes; normal Registry.onValidationResult calldata228 bytes; immutable Engine facts occupy3 packed32-byte storage words, excluding shared job headers.
- Committee100: recordRound ABI calldata9,924 bytes; normal Registry.onValidationResult calldata3,332 bytes; immutable Engine facts occupy100 packed32-byte words (3,200 bytes), excluding shared job headers. Its in-round validator address array contains100 storage words plus its length; commitments, votes, reveal flags, locks, and stake snapshots are real mappings.
- forceFinalize calls Registry.forceFinalize with36 bytes rather than onValidationResult; it does not make the normal Registry committee-copy call. This explains part of its lower measured cost.
- Selection256 was genuinely observed in the earlier partial diagnostic run; no subsequent full closure gas was captured. Encoding sizes can be calculated, but no encoded-size or per-validator arithmetic is substituted for an execution measurement.

## Runtime, compiler, frozen sources

- Node24.19.0; Hardhat2.29.1; ethers6.17.0; ephemeral chain31337.
- Production-target artifacts use genuine solc-js0.8.37 (`0.8.37+commit.f401782d.Emscripten.clang`), optimizer200, viaIR, evmVersion=cancun. Compiler metadata for linked inherited fixture artifacts is included per artifact in JSON.
- Production target build ID: `ee79179268b7d4a38b0f7401e42ee8028be0abe79953030c970c4f3bab758a3a`. Mock-only selective output build: `4d117975d149e5f6026d09a7a4ce57f7f030f0e18d1af563723d99ce56ff295a`.
- Frozen184 Solidity-source manifest SHA-256: `888754a776cf8b78e6bd817fa5daa4aac98064f05a4d1268058e657a7499dd6f`. All sources were checked against it before each run and after every completed run; no mismatch was found. A final standalone verification is included.
- JSON records include controller/delegate runtime byte sizes and keccak256 hashes, artifact/source SHA-256, build metadata, all closure/commit/reveal receipt hashes, gas limits, gas used, block ceilings, timestamps, state and configuration.
- Existing diagnostic artifacts are reused without compilation. Optional EDR source-stack decoding is disabled by the supplied candidate config; this is not a canonical compiler build or full canonical CI evidence.

## Failures and resource bounds

- Original Osaka selected100 and256: requested transaction gas16,777,216, receipt gas16,515,488, status0, empty revert data. The delegate-call failure preserves outer-frame gas; receipt gas need not equal the requested ceiling. The exact errors and transaction hashes are in the corresponding JSON files. The independent over-cap probe confirms the hard cap directly.
- Diagnostic Cancun selected256 with60M setup gas: failed, with transaction hash and empty revert data. The initial runner did not persist that failed receipt, so no precise gas-used claim is made for that attempt.
- Diagnostic selected256 at100M: selection succeeded at74,654,299 gas. The process was later killed with exit137 before a closure result. A concurrent native run was also killed; its measured100 failure is retained and its256 failure was rerun alone successfully as a failed-receipt observation.
- The sole guarded sequential diagnostic retry stopped after7.07s, peak observed RSS1,805,676,544 bytes, above the explicit1,610,612,736-byte (1.5GiB) budget. Sampling every250ms can overshoot the threshold. Stop reason and resource budget are persisted. No further256 attempts were made.
- The initial bare-default3 `early-mixed` row accidentally revealed three approvals and is explicitly excluded as mixed-vote coverage. The subsequent explicit-protocol3 mixed case correctly used2 approvals/1 rejection and is the reported mixed result.

## Evidence and reproduction

Primary report: this file. Machine summary: `summary.json`. Comparable closure rows: `closure-results.csv`. Full evidence: `diagnostic-cancun.json`, `native-protocol-default3.json`, `native-default-large-pools.json`, `native-sparse-pool256.json`, `native-osaka.json` (partial run,100 receipt), `native-osaka256.json`, `native-cap-probe.json`, `run-status.json`. The partial/guarded256 files preserve the measurements and the absence of closure results.

`fixture.ts`/`fixture.cjs` adapt the existing real integration fixture; `benchmark.cjs` is the isolated runner. The initial runner/fixture are also retained. The candidate path is `jobs-resume/reputation-candidate`; use its dependencies read-only. Runtime execution sets `HARDHAT_CONFIG=hardhat.reputation.config.cjs`, `DISABLE_V8_COMPILE_CACHE=1`, XDG directories under `/tmp/jobs-hardhat-*`, and NODE_PATH to the candidate node_modules. For default-profile runs set `DEFAULT_SELECTION=1`; `PROTOCOL_APPROVALS=1` adds the explicit protocol value3. `BENCH_SIZES` chooses registered pool sizes, `BENCH_MODES` chooses closure branches, `SPARSE_ELIGIBLE=3` removes authorization from the remaining pool addresses.

The isolated diagnostic config changes only local EVM hardfork/gas ceilings. It is not a production configuration recommendation. Any future large rerun should use the resource supervisor and an explicit resource budget; do not run these oversized diagnostic cases concurrently.
