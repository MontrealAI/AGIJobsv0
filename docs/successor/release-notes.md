# 2.1.0-rc.1 — SUCCESSOR Ω

Release candidate for **α-AGI Ascension → SUCCESSOR Ω**. Base: `5b4cebb309a83a7a6749d8911d8bf96a1921e042`. Generated release evidence records `checkout.revision`, `checkout.tree`, working-tree state and the executable `sourceDigest`; the release PR identifies the final head and its checks. This record does not announce production admission or a completed protected independent examination.

This candidate also integrates the separately reviewed deployment, gateway, validator and diagram repairs from main commit `d25842f609dd525582bf5fcbccea778e7443d3df` (PR #3914). The original source baseline remains the first published release; validation of the combined tree is recorded in the release PR.

The October 10 integration also retains main `dfcb5b8106446d900d4fdb31e384f25b87947e61`: CodeQL action alignment, validator admission/recovery and the guided EN/FR onboarding from PRs #3916–#3918. Both onboarding and SUCCESSOR routes, browser gates and all original diagrams remain present. Current results belong to the final combined revision recorded in PR #3915; earlier measurements below describe their original validation revisions.

## What changes

AGI Jobs gains a shared mission layer for bounded discovery, sealed work, comparative evidence and retained knowledge. The package, CLI and EN/FR public journey use the same core calculations. Models and operators can change while the mission's methods, evidence and failures remain inspectable.

- **Mission and SEIZE:** strict versioned records, ordered underwriting, 21 portfolio templates, sealed graphs, planned coverage, budgets and dependency invalidation. A Promotion Request grants no authority.
- **Executable discovery:** restricted WORLD/POLICY programs, finite candidate search, counterexamples, a correlated-evidence planner and explicit resource constraints.
- **Proof and governance:** complete-system freeze, purpose-bound Ed25519 records, declared evaluator trust/independence, fixed-sample comparative bounds, hard gates, separated admission and action-time limits.
- **Durable operation:** SQLite events/replay, version and idempotency checks, budget reservations, revocation, registered dependency impairment, failed-cleanup stops and uncertain-effect reconciliation.
- **Customer knowledge:** bounded JSON Mission Packs, negative knowledge, clean-directory replay, actual local algorithm substitution and descendants with no inherited authority/current proof.
- **Existing integration:** outer schema-v1-compatible computer-work binding and local-chain settlement reconciliation, preserving current protocol assets and economic rules.
- **Public experience:** `/AGIJobsv0/successor/` and `/AGIJobsv0/successor/fr/`, accessible workbenches, honest state labels and preserved demo/diagram routes.

## Measured local behavior

The invoice fixture compiles ten jobs and returns `HOLD_AND_ESCALATE` with source-bound findings. It neither concludes fraud nor approves payment. The world-model fixture rejects a patch with **54/60** correct outcomes and **6 critical misses**; a synthesized candidate and stronger conventional comparator both reach **60/60**, removing a claimed unique advantage. Resource/evidence workbenches account for shared calibration error, changed case frequencies and physical capacity.

The actual WORLD candidate then crosses the complete local examination path: 16 component bindings are frozen, the challenger and both comparators reexecute the same 60 public cases, and the measured tie produces a signed **I0 FAIL**. The bundle includes component material, case evidence, source commitment and explicit missing assurances. Its fixture trust, authored cost tariff and conditional sampling assumptions do not establish fresh protected proof; independent admission remains denied.

The local-chain evaluation case pays for an accurately completed **FAIL** report against its frozen work criteria. The evaluated candidate remains failed/unadmitted, with no authority. These are executed local fixtures and chain tests, not external customer performance or mainnet settlement claims.

## Run and inspect

Use the pinned Node **22.23.3**, npm **10.8.2** and locked dependencies:

```bash
npm run successor:demo
npm run successor:verify
npm run successor:test
npm run successor -- help
```

The demo reports a fresh directory under `reports/successor/` containing the three mission results, `world-examination.json`, public fixture trust, proof rehearsal, SQLite Chronicle, checkpoint, Mission Pack, restored record, descendant and release-evidence JSON. Individual commands accept `--file` and `--out`; output creation does not overwrite existing evidence. Independent proof/admission commands require separately provisioned `--trust` and applicable signing identities.

See [migration](migration.md) before using `metadata.successorComputerWork` or `successorManifestSha256`. Legacy v1 task normalization and existing settlement semantics remain compatible. The new successor bridge is **fixture/local only**; the existing legacy live path retains its separately documented admission rules.

## Validation observations and release gates

Use the release dossier's command results, checkout revision, working-tree state and source digest for exact validation evidence. The following gates remain distinct; changing code or assets requires rerunning affected checks:

| Check | Observed result / boundary |
| --- | --- |
| Successor core | 98/98 local core tests pass, including actual WORLD examination, runtime boundaries and clean-directory CLI replay |
| Compiled orchestrator bridge and legacy worker tests | 69/69 successor and legacy tests pass; actual local-chain lifecycle accepts and pays the accurate FAIL report |
| Existing contracts | After integrating main, the complete Hardhat suite passes 822 tests, 267 Solidity files compile and the bytecode-size gate passes; the release PR identifies the exact validation revision |
| Documentation and public site | Combined tree: 299 Markdown files pass link checks; rebuilt site passes 60/60 tests and preserves 76 demos, 353 guides and 267 diagrams; browser QA passes 48 checks, and the source audit passes 504 diagrams plus one template target |
| Maintainer signing trust | **BLOCKED:** configured maintainer key payload is not a valid OpenSSH public key |
| Production dependency audit | **BLOCKED:** observed root lockfile has 0 critical and 7 high findings |
| Independent proof / live successor worker / production authority | **EXTERNAL:** no such commissioning is inferred from local tests |

An earlier site regression detected stale copied package metadata during concurrent edits. The release dossier retains that observation and the final rebuilt-site result; a source or documentation change does not silently convert a failed check into a pass. Local, chain and external commissioning results are never combined into one score.

The [acceptance matrix](acceptance-matrix.md), [security review](security-review.md), [operations guide](operations.md) and [current platform readiness](../production/readiness.md) describe limits and evidence. Publication of source or Pages does not clear signing, dependency, independent-examiner, provider/network or production-action gates.

## Hosted security-review follow-up

The initial hosted CodeQL review found a CLI file-check/read race and two unused-variable findings. The CLI and standalone proof harness now share a bounded reader that checks the opened descriptor, refuses symlinks/nonregular files and detects observed changes. Regression tests exercise deterministic path replacement, post-check growth, mutation and FIFO handling. The two unused variables were removed. Malformed JSON errors also omit input fragments to prevent accidental disclosure through logs. Hosted CodeQL analysis and its aggregate gate pass on `d2fa1d7c09a4d0595917e3922ada1c2ec6dfb045`; combined-tree analysis after integrating main is tracked separately in the release PR. These fixes do not clear the separate production signing/dependency gates.

## Integration test-fixture correction

Hosted CULTURE coverage exposed two indexer tests timing out while each launched Prisma migrations inside its five-second test deadline. The fixture now runs the actual migrations once per test file in a bounded setup hook and copies the closed, empty database for each context. Tests retain their five-second deadline and all four 90% coverage thresholds. Cleanup retains the actual Prisma disconnect method across restored spies and reports failures instead of silently ignoring them. Isolation regressions verify separate records, the checksum migration, repeated cleanup and fresh contexts. All 34 indexer tests pass locally with 92.94% statements/lines, 90.78% branches and 95% functions; hosted confirmation is recorded in the release PR.

## October 10 engineering review

The October 10 additional engineering review identified a verifier-side assurance-label gap: directly signed public fixture receipts could claim I2 despite the issuer refusing that label. Verification now enforces the same synthetic-public I0/I1 ceiling independently of the issuer and trusted key maximum. A regression signs I2, I3 and I4 claims outside the issuer and rejects all three, while valid I0/I1 labels remain accepted. The integrated core suite passes 99 tests. This correction does not imply protected evaluation, live effects or production admission.

## Containment and rollback

Stop affected successor work and preserve its state, nonce/dispatch journals and evidence. Reconcile unknown effects before retry or downgrade. Restore a known-good code/artifact version without deleting refusal records or granting old permissions. Imported knowledge and fallback candidates require their own current proof and authorization; restoring a file or heartbeat cannot revive revoked authority.
