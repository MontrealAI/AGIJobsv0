# Complete development verification and qualified activation

Source verification establishes correspondence between a specific deployed address and compiler/source/constructor inputs. It does **not** establish contract safety, economic correctness, worker quality, security approval, ownership handover, or permission to transact. Development inventories count source definitions; deployment inventories count actual chain addresses. They are different inventories.

## Development gate

Run the canonical compile and `node scripts/ci/check-solidity-build.cjs`. The check begins with every `.sol` file under `contracts/`, then the compiler AST's contract definitions. Every definition requires a matching artifact, compiler output, source/import closure and admitted compiler/profile. Deleting an optional artifact or adding an uncompiled source fails. Externally linked libraries are recursively required, including upstream library artifacts. Abstract/interface, inline-library, test/mock and legacy/demo definitions remain compiled and checked. Their exclusions apply only to production deployment bytecode-size limits; core, optional deployables and externally linked libraries remain size-gated.

`npm run verification:inventory` emits the full development source manifest. `scripts/deploy/archive-verification.cjs --output NEW_DIRECTORY` exclusively archives original full standard input, build output and all inventory artifacts with hashes. Archive the final release build; do not rebuild after deploying and substitute new artifacts.

Local solc-js diagnostic builds must retain their actual compiler string and compiler-file provenance, be explicitly marked `diagnostic: true`, and cannot enter production admission. `source-inventory.cjs --diagnostic` only reports local completeness/size diagnostics. It never produces qualified production evidence. Copying a normalized compiler field onto diagnostic output still fails canonical admission. Canonical compiler CI and whole-release qualification remain separate requirements.

## Durable creation evidence

`deployDefaults.ts` journals each submitted hash, sender, nonce, chain, input and original constructor encoding before waiting. Direct delegate receipts and coordinator component receipts append address/transaction-keyed creation attempts. Duplicate names, replaced and orphan delegates are preserved. The older name-keyed `creationRecords` is a compatibility summary, not the authoritative complete inventory. Retain **all** journals from interrupted/resumed attempts, the coordinator address and the original archive.

The verification-only reconciler never loads Hardhat, a wallet or a signer. It performs no deployments, ownership changes or activation. Canonical block scanning from an explicit reviewed start block recovers creation transactions missed by callbacks, including orphan delegate deployments. The boundary must precede the first attempt, and every deployment sender/coordinator must be included. A process dying between broadcast and journaling is why retained evidence alone is insufficient: keep the original start boundary and sender identities and reconcile the chain. Do not choose a later boundary merely to hide an interrupted attempt.

Every transaction has an explicit status. A missing transaction is `unresolved`, not assumed dropped. Replacements require same-sender/same-nonce evidence, a canonical replacement receipt and inclusion of the replacement transaction. Pending, unresolved, noncanonical and insufficiently confirmed receipts block qualification. Canonical reverts are retained but create no addresses. A provider's inability to establish finality, history or a canonical transaction is a blocker.

For each successful scoped transaction, `debug_traceTransaction` callTracer enumerates CREATE/CREATE2 calls, including constructor-created children without events. A separate stack- and memory-enabled opcode trace must independently account for the same hierarchy. The supported trace profile enforces:

- Root sender/destination/input binding; complete frame schema and supported opcode schema.
- One-level call entry and matching terminal/resumption boundaries, with no skipped depths, hidden siblings or trailing execution.
- Opcode program-counter transitions, stack heights and untouched prefixes, exact resumed parent call results, and the returned CREATE address. CREATE2 additionally binds creator, salt and initcode hash.
- Exact child input from opcode memory, destination from call arguments, storage context for delegate calls, and terminal output from opcode memory. Memory allocation is tracked per context; Geth's omitted memory field is permitted only while allocation is zero.
- REVERT versus successful terminal consistency with the child's error flag and parent result. Creations below a proven reverted ancestor are excluded, while all their attempts remain checked.

The validator deliberately rejects exceptional halts, no-entry child calls (including empty-code/precompile calls and CREATE collisions), and constructor RETURN followed by code-deposit failure. These unsupported cases are blockers, even if another interpretation might establish their outcome. Missing/truncated stacks, memory or trace frames have no soft fallback. Only canonical root reverts are directly retained without any creations. This is a bounded execution-consistency check, not full EVM re-execution or proof of an honest RPC.

Genuine Geth 1.17.6 dual-trace fixtures exercise the supported subset and unsupported cases. Installed Hardhat 2.29.1/EDR was independently observed to reject callTracer, so it cannot satisfy this profile. Provider/client differences still need integration testing before adoption. Both trace formats remain trusted RPC evidence. There is no receipt-only fallback that might omit internal creations. Coordinator events, mappings and initcode commitments are independently reconciled. The complete traced initcode must match exactly one archived compiler artifact plus canonical constructor encoding. Runtime must match the full linked bytecode and immutable substitutions recovered from the canonical constructor trace; trace output must also equal current runtime. Links recursively require the exact source/address library entries. Inline libraries require no fictitious deployments.

## Preparing and resuming verification

Use a fresh output path every time. Environment variables `VERIFICATION_RPC_URL` and `ETHERSCAN_API_KEY` are read privately and never recorded in reports. Preserve the original archive; retries create new receipts rather than replacing failed evidence.

1. Prepare a manifest, giving an explicit release identity, pre-attempt block boundary, finality policy and receipt freshness window:

   `npm run verification:prepare -- --archive RELEASE.verification --journal ATTEMPT1.journal.jsonl --journal ATTEMPT2.journal.jsonl --release RELEASE_COMMIT_SHA --scan-from-block START_BLOCK --confirmations CONFIRMATIONS --max-age-blocks FRESHNESS_BLOCKS --system-pause ADDRESS --governance ADDRESS --output NEW_MANIFEST.json`

2. If needed, pass `--dependencies FILE` when preparing. The JSON file may contain only `libraries` (fully qualified library name to address), `reused`, and `replacements`. A reused dependency records `address`, `role`, `reviewed: true`, `runtimeDigest` (the exported `digest(lower(runtime))`), `reviewEvidenceFile` and its `reviewEvidenceSha256`. Review files are hash-checked relative to the manifest. This is an explicit operator review, not an automatic approval. Reused external contracts are never called new deployments. Newly attached optional modules must appear in actual creation evidence or the reviewed reused inventory. Unknown attached contract pointers block qualification.

3. Run read-only reconciliation and exact explorer metadata checks:

   `npm run verification:resume -- --manifest NEW_MANIFEST.json --archive RELEASE.verification --output NEW_RESULT.json`

4. Only when source submission is authorized, add `--submit`. This submits missing source through the official Etherscan v2 API. Submission success, a GUID, timeout, skipped verification, or an "already verified" message never qualifies an address. Read the resulting exact explorer metadata in a later run. Existing verified source succeeds only when archived standard input/settings, compiler, constructor and target identity match. A similar source or different settings fails. Strict exact-input matching can reject explorer formats that omit or normalize evidence; such a result stays blocked pending supported exact evidence, rather than falling back to a weaker match.

5. Once every actual creation is verified and all dependencies are reviewed, request `--qualification-output NEW_QUALIFICATION.json`. Qualification snapshots current ownership, SystemPause wiring and every scalar zero-argument getter exposed by deployed ABIs. Managed modules must remain paused and owned by the expected SystemPause. Unreadable getters fail closed. Non-enumerable mappings, dynamic/time-sensitive getters and security assessment still need commissioning review; a changing getter can require a new receipt.

## Supported qualified activation

`owner:system-pause` defaults to a read-only dry run and never looks up a signer for that dry run. Unpause requires `--manifest FILE --archive DIRECTORY --qualification FILE`. It checks exact operation `unpauseAll`, target, governance, chain, release, archive bytes, manifest/journal binding, complete address set, links, immutables, runtime, canonical/final receipts, exact explorer identity and current wiring/configuration. It reruns creation reconciliation, so a later orphan deployment cannot inherit an older receipt. The receipt has an explicit block-age limit.

`--execute` is separately required for a transaction. The guard runs before signer lookup and again after any interactive confirmation delay, immediately before signing. A qualification receipt is evidence, not user transaction authorization. `--yes` alone does not execute. Failed/unverified/pending/skipped explorer results cannot qualify production.

Emergency `--action pause` remains available without any verification receipt or explorer service; use explicit `--execute` when emergency broadcasting is authorized.

**Governance can bypass this operational tooling and call contracts directly.** There is no on-chain explorer oracle and no contract-enforced source-verification guarantee. Other low-level scripts, direct contract calls and local demonstrations are not this qualified activation path. Protect governance keys and follow transaction-approval policy. Hashes make accidental substitution detectable, not a cryptographic attestation from an external auditor. Chain/RPC/explorer trust, reorgs after observation and changes between the final check and inclusion remain operational risks.

## Regression coverage

`npm run test:verification` covers missing optional artifacts, new/stale sources, linked and inline libraries, exact archive binding and diagnostic-compiler rejection, explorer failures and exact already-verified idempotence, orphan/duplicate/optional deployments, coordinator/internal creates, pending/replaced/reverted/reorged receipts, runtime/link/immutable evidence, wrong chain/constructor/source, stale/tampered manifests/receipts, no-signer defaults, emergency pause, explicitly scoped activation and secret-safe errors. The focused semantic TypeScript check uses the real compiler and Hardhat-ethers declarations for both changed entrypoints and their imported dependencies. Most tests use deterministic RPC/explorer fault fixtures. Committed Geth replay fixtures are genuine outputs from a disposable, peerless local dev chain, with official-client signature/hash provenance. The capture harness `node test/scripts/capture-geth-traces.cjs ABSOLUTE_VERIFIED_GETH NEW_OUTPUT_JSON [CANONICAL_ARCHIVE]` starts and stops its own loopback-only client and uses only its disposable test account. It accepts no external RPC, wallet or key. The fixture compiler is explicitly diagnostic, not canonical production evidence. The optional canonical-archive phase deploys two copies of an authentic archived test contract and proves recovery of an omitted journal entry; explorer responses are simulated and make no public verification claim.

Replay tests mutate genuine child outcomes, ancestor errors, depth, parent results, stack/memory and child inventories. They require conservative rejection. The original failed capture (Geth memory-schema difference) and transient indexing failure were retained as review evidence rather than overwritten. Full release CI, production-source recompilation after integration, independent review and fork rehearsal remain separate requirements. No fixture or passing test authorizes production activation.
