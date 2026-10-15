# Second mainnet deployment: review and owner-accepted omissions

Status: preparation only; DEPLOYMENT BLOCKED pending reputation payout-unit and terminal-scoring corrections, independent review and full candidate qualification. The [separate growth correction](reputation-growth-correction-2026-10-15.md) fixes the reproduced positive-credit underflow in new source builds. It is not deployment authorization or production certification.
Review baseline: `7b21ce05b0b18b46162da66c2f528334101f6f40` on 15 October 2026.
Target window: Friday evening, 16 October 2026, America/Toronto (Montreal, UTC−04:00), and the following weekend; exact signing time remains owner-controlled.

## Scoped owner decision

On 15 October 2026 the owner requested preparation for another deployment and explicitly chose **no external independent audit and no Sepolia deployment** for this release. Record each as **NOT PERFORMED — OWNER-ACCEPTED OMISSION**, never as passed checks. AI-assisted review, local tests, CI and local mainnet-fork rehearsal do not constitute an independent audit and do not establish the assurance omitted by either decision. This decision does not waive unresolved technical defects, authorization, exact-release evidence, ownership verification, accounting reconciliation or safe commissioning. It does not authorize signing, broadcasting, spending, changing deployed state or creating credentials.

The independent-audit/testnet recommendations in historical documents remain historical and generally applicable. This document records the exception for the proposed second deployment only. It does not redefine independent buyer acceptance or validator independence, nor approve workers or paid intake. Historical `productionApproved: false` and `liveIntakeOpen: false` records must not be edited to imply approval.

## Prior deployment and what it proves

The [24-address record](../deployments/ethereum-mainnet-2026-10-12.json) identifies source `b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e`, tree `4c95939614f0b21681ac94915e5365623f5bee48`, tag `source-v2.1.0-rc.4`, Solidity 0.8.25, Cancun, optimizer 200. Finalization transaction: `0x982bb93de4d3922e3cdfd2886468b5d4943344c3b852e2741b3c6bdcfa1aeb5f`. Its explorer observations recorded 24 exact source matches on 12 October.

The [later readback](../deployments/evidence/configuration-readback-2026-10-13.json) records immutable-inclusive runtime comparisons at provider-reported finalized block 26,179,827, hash `0xfd801d479a6e103d6785adad5fcc6521907afc2eab8594cbbb09932999a8cef5`. These are dated evidence, not a current live snapshot. The earlier manifest's masked-immutable comparison is weaker and is not substituted for the later evidence.

The new baseline uses Solidity 0.8.37. Old compiler output, verification successes and constructor arguments cannot certify newly compiled bytecode. Preserve original Standard JSON input, complete dependency sources, build information, compiler executable identity, constructor arguments and per-address verification receipts. Reproduce old contracts with their original release, not the new compiler.

## Actual staged core

The supported staged deployment consists of Deployer; StakeManager; JobRegistry; ValidationModule; ReputationEngine; ArbitratorCommittee; DisputeModule; CertificateNFT; FeePool; IdentityRegistry; PlatformRegistry; JobRouter; PlatformIncentives; SystemPause; and ten fixed implementations:

- JobRegistryConfiguration, JobRegistryLifecycle, JobRegistrySettlement
- StakeManagerConfiguration, StakeManagerStaking, StakeManagerEscrow, StakeManagerSlashing
- ValidationModuleConfiguration, ValidationModuleVoting, ValidationModuleSelection

This is 24 contracts with tax disabled; TaxPolicy adds the 25th when explicitly selected. RewardEngine, Thermostat, kernel alternatives and demo contracts are not silently added to this inventory. Fixed implementations are part of the security and runtime-verification boundary, not merely off-chain libraries.

Recovered local 0.8.37 artifacts match compiler bytecode/ABI output and all recursively inspected core Solidity source dependencies at the review baseline. All 24 runtime templates fit EIP-170; JobRegistrySettlement is 24,334 bytes, leaving only 242 bytes. These recovered artifacts are **not production admissible**: their recorded long version includes `.Emscripten.clang`, which the exact production compiler policy rejects. Do not relabel evidence or loosen policy to make it pass. Obtain canonical clean-build artifacts for the frozen release and repeat dependency, bytecode, metadata, library-link, immutable and full initcode-with-arguments checks. Installed dependency-source agreement is not a substitute for lockfile-integrity verification.

## Settings comparison and unresolved decisions

All old values below are dated observations, not fresh current state. The current repository sample is not an approved production configuration. Unresolved proposed values remain unset; no executable configuration is emitted by this document.

| Setting | Old observed state | Current repository sample | Second deployment |
| --- | --- | --- | --- |
| Chain / token | Ethereum 1; AGIALPHA `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`, 18 decimals | Same | Preserve chain/token binding; freshly verify code and decimals at pinned finalized block |
| Governance | Ledger `0xa9eD0539c2fbc5C6BC15a2E168bd9BCd07c01201` | Zero address, rejected by preflight | UNSET: owner confirmation pending; separately confirm deployment signer |
| Tax | Disabled; zero tax module | Enabled with example IPFS URI, rejected by preflight | UNSET: owner confirmation pending |
| Job stake | Fixed 500 AGIALPHA | 1000 basis points (new candidate only) | Owner requested initial 10%, owner-adjustable, on 15 October. The separate candidate uses 1000 basis points by default, owner range 0–10000, ceiling rounding on gross reward excluding fees, snapshotted when creation is mined. See [percentage policy](percentage-job-stake.md). Existing deployed contracts retain their fixed amounts. |
| StakeManager minimum | 1,000 AGIALPHA | 1,000 | UNSET pending economics review |
| JobRegistry minimum agent stake | 0 | Not explicitly represented as this separate field | UNSET; do not confuse with StakeManager minimum |
| Job fee / FeePool burn | 5% / 1% | 5% / 1% | UNSET pending economics review |
| Slash shares employer / treasury / validator | 10% / 90% / 0% | 10% / 90% / 0% | UNSET pending economics review |
| Max job reward | 0 at finalized snapshot; later screenshot reports 88,888,888 AGIALPHA | Requested secure default 25 AGIALPHA | UNSET; latest state must be freshly reconciled |
| Max job duration | 0 at finalized snapshot | Requested secure default 86,400 seconds | UNSET; zero semantics must be reviewed before choosing a limit |
| Commit / reveal windows | 86,400 / 86,400 seconds | Economic config 1 day each; requested secure defaults 60 / 60 seconds | UNSET; resolve conflicting proposed values explicitly |
| Validator pool | Empty; 3 validators/job, minimum 3, maximum 5 | Merkle roots zero; pool not commissioned | UNSET: actual admitted validators, roots, committee and recovery readiness required |
| Agent / validator identity | Existing ENS roots and registry wiring in readback | `agent.agi.eth`, `club.agi.eth` roots; zero Merkle roots | UNSET: verify roots and actual admission rules; zero roots do not establish usable participants |
| StakeManager treasury | Ledger governance address | Not a separately explicit treasury field | UNSET: review routing and allowlist |
| FeePool treasury | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99`, allowlisted | Not a separately explicit treasury field | UNSET: confirm destination and allowlist |
| JobRegistry treasury | Zero address | Not a separately explicit treasury field | UNSET: review burn/blacklist payout semantics |
| Pause on launch | Eight managed modules paused | True | REQUIRED: true; later unpause requires separate approval and commissioning |

Source of sample values: `deployment-config/mainnet.json` at the review baseline. Source of old settings: the later readback above; reward-cap exception is explicitly screenshot-only. `requestedSecureDefaults` in deployment output is not evidence the values were applied: deployment tooling leaves governance application/readback as remaining work.

## Technical gates that remain

1. Freeze one exact candidate commit/tree after release tag reservation and exact-SHA CI qualification. No source-only release, AI assessment or old green run substitutes for the selected deployment candidate.
2. Canonical clean compile with policy-approved 0.8.37 identity, viaIR, optimizer 200, Cancun and IPFS metadata; resolved lockfile/dependencies and reviewed diagnostics. Verify every core artifact and complete constructor initcode sizes. Retain hashes and Standard JSON before sending anything.
3. Approve explicit governance, signer, economics, tax choice, identity admissions, treasury routes and launch limits. Validate chain ID, actual token code/decimals and ENS dependencies at a pinned block. Never use a sample address or infer a signature approval.
4. Run current unit, negative, invariant and full-committee lifecycle checks. Include accounting conservation, fee/slash splits, token-transfer failure/reentrancy, replay/domain separation, commit/reveal deadlines and missing reveals, dispute paths, pause coverage, delegated access control and two-step ownership.
5. Rehearse the exact staged plan on a **local fork only**, pinned to a documented mainnet block, with no production signer. Preserve actual token code, clearly label balance mutations/impersonation as simulation, and exercise interruption/resume with the same configuration. The 2025 fork report uses a validation stub and cannot satisfy the current full-committee requirement.
6. Reconcile old-stack obligations at a fresh finalized block: jobs, escrows, stakes/unbondings, disputes, pending fees, claims and approvals. A historical `nextJobId = 0` does not establish zero obligations now. Redeploying does not migrate storage, liabilities, allowances or reveal secrets. Keep old settlement/recovery available; never redirect or abandon obligations implicitly.
7. After separately authorized deployment, verify every creation receipt, runtime including immutable values, fixed implementation address/code, module wiring, owner/pendingOwner, governance and treasury allowlist, all eight managed pause states, token binding and actual economic limits. Verify all source inputs on the explorer; archive failures rather than claiming completion.
8. Before any separately authorized unpause: commission actual validators and workers, demonstrate settlement and rejection paths, confirm emergency pause/recovery and journal reconciliation, establish monitoring and old-stack migration/draining plan. Never present deployment completion as readiness for paid intake.

## Historical prototype observations (before canonical recovery)

- Exact-baseline focused script tests: 20 passed (candidate configuration, compiler policy and bytecode-size checks).
- Local Hardhat-chain tests: 25 passed (SystemPause, DeploymentScripts and DeploymentCli), using existing source-matched artifacts and no compilation. These are not mainnet-fork results.
- Existing core artifacts: source/dependency and artifact/compiler consistency checks described above; production compiler-admission gate failed for the recovered long-version identity.
- Exact-baseline CI reported compile-and-test and Contracts (Foundry & Hardhat) passing; other release qualification was still pending. Links: [compile-and-test](https://github.com/MontrealAI/AGIJobsv0/actions/runs/38750475650/job/116475252327), [contracts](https://github.com/MontrealAI/AGIJobsv0/actions/runs/38750475537/job/116475246065).
- No fresh RPC reconciliation, clean canonical rebuild, current pinned-fork rehearsal, independent external audit, Sepolia deployment or mainnet transaction performed by this preparation.

This remains a blocked preparation record until unresolved choices and technical evidence are reconciled. Owner acceptance of the two omissions is not acceptance of an unknown defect or blanket permission to deploy.

## Recovered percentage candidate — current local observations

The owner's supplied draft patch was verified against all 83 handoff-manifest hashes and applied to base `7b21ce05b0b18b46162da66c2f528334101f6f40`. The unrelated generated ENS alias expansion was excluded. Production governance, tax, signer and treasury choices remain unset. This branch is separate from the rc9 demo aggregate and does not advance main or reserve a release tag.

Fresh local results use Node 22.23.3/npm 10.8.2 and canonical native Solidity `0.8.37+commit.f401782d`, viaIR, optimizer 200, Cancun and IPFS metadata. `compile:mainnet` and the strict compiled-artifact/source/diagnostic/size verifier pass. JobRegistrySettlement is 24,238 runtime bytes (338 bytes below EIP-170). This is fresh canonical output; the previously rejected Emscripten artifacts are not relabelled.

- Official `npm test -- --no-compile`: **865 passed**, after correcting two remaining fixed-stake compound callers and isolating the new lifecycle fixture with snapshots instead of a chain reset.
- Configuration/deployment policy: **16 passed**. Fixed-implementation compatibility, historical matched bundles, storage and size: **12 passed**. Percentage/API and real-collateral lifecycle: **15 passed**. The overlapping focused counts are not added to the official suite total.
- New Foundry reference/rounding/overflow/snapshot and invalid-rate fuzz properties: **1,000 cases each passed** using Forge 1.7.1. CI uses its existing pinned Forge version and must qualify these exact sources independently. This new harness does not replace the real StakeManager lifecycle tests or existing invariants.
- Gateway, orchestrator and validator TypeScript builds passed. ABI export and the existing formatting check passed. Historical no-compile controller/delegate bundles remain unchanged and explicitly reject mixing with percentage implementations.
- A broader, explicitly selected JS/TS diagnostic initially had 704 passes and 14 failures. The metadata-comparison error was fixed; the extra TypeScript lifecycle fixtures still contain obsolete minimum-validator, FeePool, pause-error and batch-plan assumptions and are **NOT QUALIFIED**. One additional legacy constructor caller was migrated, but those extra suites have not been declared passed. They remain tracked follow-up work, not silently skipped by this change.

Final hosted checks, full supplemental regression migration, exact-candidate static/security review, complete mainnet-fork rehearsal and production configuration remain required. No independent external audit, Sepolia deployment, signing, broadcasting, funded work or production commissioning is claimed. The local source/artifact/log hashes are retained in `percentage-stake-local-evidence.json`; that receipt is not a substitute for exact-final-commit CI.

### Additional executed fork and invariant evidence

All **15 Foundry tests across six invariant suites passed**, including 256 cases per fuzz property; the separate new percentage properties also passed 1,000 cases each. The existing production configuration and thresholds were retained.

The local mainnet-fork lifecycle passed at block **26,200,139**, hash `0x5ba89450466ec7979fd0ab037d86077799089630aab9d8923cf63753a7cb11be`. It uses actual AGIALPHA token code/state with synthetic fork balances, local ENS/identity fixtures and an operator-controlled validation stub. It checks a 10% creation snapshot after a later rate change, completion, certificate sale, no remaining lock, retained deposited stake and exact wallet accounting. This is **partial fork rehearsal**, not full real ENS, independent committee or old-instance obligation qualification. The first attempt retained an obsolete 1-token deposit balance expectation; the corrected assertion accounts explicitly for the full 10-token deposit and separately retained stake, without reducing any collateral or production rule.

[Additional immutable receipt](percentage-stake-fork-invariant-evidence.json) binds the prior published draft, changed fork-test bytes, block identity and executed logs. The initial local evidence receipt is preserved unchanged. This fresh observation does not close the remaining technical or owner-configuration gates.

### Final caller-migration checkpoint

The additive [caller migration receipt](percentage-stake-caller-migration-evidence.json) records a subsequent canonical build and 867 official Hardhat passes. Redenomination retains basis points unchanged, HGM has an explicit percentage setter and rejects fixed units, and owner/ASI/Aurora demo callers use the correct collateral. Local browser, deterministic kit and 1-job/3-job simulated EVM journeys passed within the receipt's stated scope. Earlier receipts remain unchanged; complete supplemental TypeScript, exact-head hosted/security review, full fork/obligation/configuration and signing-plan gates remain open.

### Confirmed reputation blocker — separate repair required

The [reproduction receipt](reputation-growth-blocker-2026-10-15.json) records an inherited arithmetic panic on positive reputation growth and the successful-finalization hook. This stage does not repair ReputationEngine or imply production readiness. Canonical compilation, passing stake/fork tests and the accepted audit/Sepolia omissions cannot override this blocker. Review monotonic growth, producer token units and terminal exactly-once scoring in a separate repair.

The previously unqualified supplemental fixture migration is now reconciled from published #3970 and #3969 without dropping original branch ancestry or the added economic/invariant tests: 723 recursive v2 tests and 20 focused lifecycle/governance cases pass. These are local overlapping counts, not a final-head hosted release or complete cutover rehearsal.
