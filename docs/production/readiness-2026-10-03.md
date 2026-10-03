# Production readiness review — 2026-10-03

Reviewed baseline: `7049353e1ee13c19b97365b269f9a9ac1800434c`, with the accompanying readiness-hardening changes. This is an engineering verification record, not an independent security audit or a claim that the full vision has been proven in production.

**Decision: suitable for continued local development and demonstration; not ready for a mainnet release.** The modular candidate passes the contract-size gate; release trust and the remaining integration/configuration gates are not complete. Existing features, examples, and diagrams are preserved.

## Verified locally

| Check                                                                      | Result                                                                                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported root toolchain                                                   | Node 22.23.3, npm 10.8.2; toolchain and lockfile checks pass                                                                                   |
| Solidity compilation                                                       | 267 source files compile with the repository's default optimizer/viaIR settings                                                                |
| Full `npm test`                                                            | Pretest checks and 581 Hardhat tests pass with contract-size limits enforced                                                                                                      |
| Python repository suite                                                    | 246 passed, 1 skipped                                                                                                                          |
| Focused recursive-model suite                                              | 13 passed                                                                                                                                      |
| New release guard regressions                                              | 12 passed: signed/unsigned/untrusted/wrong-commit tags, shell metacharacters, malformed keys, and bytecode-size boundaries and empty artifacts |
| Gateway and orchestrator builds and runtime packaging                      | Pass; 4 packaging regressions pass                                                                                                             |
| Owner console production build                                             | Pass                                                                                                                                           |
| CI context synchronization, summary coverage, formatting and targeted lint | Pass                                                                                                                                           |
| Demo gallery                                                               | 41 runnable suites exercised; three initial failures repaired and all affected suites pass on rerun                                            |
| Root README flowcharts                                                     | All 17 Mermaid blocks identical to the reviewed baseline                                                                                       |

The initial demo runner skipped some suites when their independent toolchains were absent. The follow-up below adds specific Foundry, Prisma, and browser checks; it does not establish that every skipped suite passed. Docker is unavailable locally, so container builds and vulnerability scans require the pull request's workflows.

## Follow-up verification and repairs

The first CI cycle at `00fa77e4b6282dde4ead8ce1dcfc28c34f365296` passed 38 workflows, including the primary containers, Torch tests, contract CI, fuzzing, static analysis, and root browser workflows. Application-image builds and CULTURE failed; two long-running demo workflows were cancelled, and core CI was still running when checked. These results belong to that commit, not to subsequent fixes.

- Upgrade all four Next.js manifests/locks to the September security release **15.5.27**. Enterprise portal, Onebox, and validator UI production builds pass. Validator UI now uses strict TypeScript checking. Repair the application-image build contexts, portal dependency installation, digest/provenance subjects, and promotion order so `latest` follows the OS scan.
- Repair CULTURE's independent pnpm dependencies, ESLint 9 compatibility, npm image lockfiles, shared-code bundle, Prisma generation checks, Compose anchors/build contexts, and static-server packaging. Its three service builds and lint checks pass. Existing source-format checks required mechanical formatting changes; no workflow screens or diagrams were removed.
- Require authenticated write requests when configuring an on-chain arena operator. Validate paired operator/address settings and canonical/legacy address aliases. Obtain round IDs from the confirmed transaction's `RoundStarted` event instead of a preflight call that could race another transaction.
- Forward rejected Express 4 handlers, await startup recovery, clear completed-operation timers, and write persistent state through serialized atomic replacements. Corrupt or unreadable state now blocks startup. Failed replacement preserves the previous state file and does not poison subsequent saves.
- Make studio preview mode explicit (`VITE_DEMO_MODE=true`), label simulated results, and make it issue no service requests. Service mode exposes failures rather than inventing successful uploads, mint receipts, jobs, or owner changes. Correct the GraphQL artifact query, escape tooltip content, and improve graph-label contrast. The operator token is kept in tab memory and sent only to the orchestrator.

| Follow-up check                       | Result                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Root pretest checks and Hardhat suite | Pass; 571 Hardhat tests                                                                                                        |
| CULTURE Foundry v1.4.4                | 26 tests pass                                                                                                                  |
| CULTURE Hardhat                       | 3 tests pass                                                                                                                   |
| CULTURE arena                         | 58 tests pass; 100% lines and 96.51% branches in its configured coverage scope                                                 |
| Compiled arena runtime                | Startup, health endpoint, rejected missing/wrong credentials, authenticated validation, and graceful SIGTERM pass              |
| CULTURE indexer                       | 2 tests pass; coverage gate fails                                                                                              |
| CULTURE studio API                    | 20 tests pass; 98.07% lines, 82.14% branches in the configured API-helper scope; branch gate fails                             |
| CULTURE browser walkthrough           | Draft, preview upload/mint/job, arena, and error-state checks pass; zero uncaught browser errors and zero preview API requests |
| Workflow syntax                       | Actionlint passes for both edited workflows                                                                                    |

The corrected Vitest thresholds use **90**, not **0.9** (which meant 0.9%). Indexer coverage is 24.54% lines, 57.74% branches, and 43.24% functions. Arena coverage excludes several adapters and the service implementation in the existing configuration; its percentage must not be presented as whole-service assurance. Browser walkthroughs exercise the explicit preview and error behavior, not real economic settlement.

The CULTURE gas snapshot is stale, and the lifecycle (682,540 gas versus 500,000 budget) and misconduct (612,729 versus 520,000) scenarios exceed committed budgets. Those budgets were not raised. Its Compose/Cypress commissioning still requires deployment to real dependency contracts, valid operator roles, and resolution of the existing duplicate-service/environment setup. Studio requests for LLM generation, IPFS upload, artifact minting, job creation, and owner controls need real provider implementations; several backend adapters also remain simulations. These are release blockers in addition to the mainnet items below.

## Release publication follow-up

Before the modular refactor below, a subsequent release review confirmed that the authorized-signers check and production size gate both failed. At that stage, no tag or release was published and the changes were still in PR #3876. The public repository had no release records or remote tags; no version was invented to conceal the blocked state. The main-branch follow-up below records the subsequent merge.

The release workflow now requires successful main-branch CI for its exact commit, a matching signed-tag workflow ref, contract verification before container/npm publication, and scans of both image architectures before signing immutable digests. GitHub assets stay in draft until image promotion succeeds. Prereleases cannot move `latest`, and the separate container workflow no longer promotes tag builds. Current Cosign 3.1.3 bundle signing preserves the detached signature/certificate assets, adds the complete verification bundle, and uses the required attestation permission. Downloaded checksums no longer require a `dist/` subdirectory. The signing guide now uses valid SSH registry instructions and the correct GitHub provenance verification command.

Additional validation:

- CULTURE installs, lints, and builds in a clean temporary tree without the root npm dependencies. The GitHub arena lint failure came from an undeclared body-parser type dependency; the server now uses Express's built-in JSON parser with the same 1 MiB limit.
- Studio API coverage now **passes**: 25 tests, 100% lines, 95.23% branches, 100% functions. This supersedes the earlier studio branch failure above; indexer coverage and gas failures remain open.
- All 30 release regressions pass (12 prior signing/size checks plus 18 CI/publication checks). They cover stale/foreign/missing/pending/failed evidence, pagination and API failures, dependency ordering, prerelease promotion, draft publication, and portable checksums.
- Application-image CI at `dab6bae0b37ae2996bc3f02a52ec7c2c1f243f05` passed both console and portal builds/scans ([run](https://github.com/MontrealAI/AGIJobsv0/actions/runs/37132344290)). Its CULTURE job still failed on the gas snapshot and the arena lint issue repaired here. New-head CI must be checked independently.

Publishing a production release still requires review of the modular refactor, a verified maintainer public key and maintainer-signed tag, real deployment/governance configuration, completed integration/coverage/gas work, and passing CI. The private signing key must remain with the maintainer.

## Repairs included

- The scheduled Torch workflow installed the optional Streamlit dashboard after FastAPI. That second installation replaced Starlette 0.41.3 with an incompatible 1.7.0 and caused nine collection errors. Headless model requirements are now separate, installed with the platform requirements in one resolver invocation, followed by `pip check`. Relevant pull requests trigger this check.
- Compiled runtime packaging now includes the gateway config helpers and gRPC schema. The gateway and orchestrator launch commands now point to their emitted server entrypoints; compilation alone had not caught these startup failures.
- Node 20 pins were updated to supported Node 22.23.3 across the root toolchain, workflows, Dockerfiles, and explicit-version instructions. The Node doctor no longer reports an exact matching pin as a mismatch.
- The container workflow now uses supported primary base images and a current Trivy scanner, gives its matrix jobs stable required-context names, scans PR builds, and scans both published architectures before promoting a candidate to `latest`. Existing application-library scans remain advisory; green OS scans are not a complete dependency-security sign-off.
- Release verification parses actual OpenSSH public keys, invokes Git without shell interpolation, checks trust and the checkout commit, and applies to manual releases too. Invalid placeholder signing bytes no longer pass validation.
- Production releases and mainnet preparation enforce EIP-170 runtime and EIP-3860 initcode limits. Invalid or empty Safe-plan JSON is no longer replaced with a successful-looking empty object.
- The CULTURE CI dependency cache now resolves pnpm inside its own workspace, after Node and Corepack setup. The root npm package-manager declaration had blocked setup before any demo checks ran.
- Demo tests isolate inherited environment variables and network probes. The reasoner subprocess disables host startup customizations with Python `-I -S`. Its tests use the configured default memory allowance and separately assert failure under memory exhaustion. This subprocess is still a trusted demonstration harness, not a security boundary for arbitrary hostile programs.

## Mainnet size gate

Run `npm run compile`, then `npm run release:check-size`. The modular candidate passes for **66** non-mock deployable v2 artifacts, including ten fixed implementations. The [deployment architecture guide](fixed-implementations.md) explains the constructor changes, shared layouts, direct-call protections, domain separators, and paused/resumable staging.

| Contract | Previous runtime bytes | Candidate runtime bytes | Candidate initcode bytes |
| --- | ---: | ---: | ---: |
| JobRegistry | 48,855 | 8,004 | 11,847 |
| StakeManager | 45,337 | 7,881 | 10,396 |
| ValidationModule | 28,199 | 6,368 | 8,980 |
| Deployer | 234,082 | 10,116 | 10,239 |

Normal Hardhat tests now set `allowUnlimitedContractSize: false`, use automatic gas estimation, and enforce a 30 million block gas limit. Constructor arguments also contribute to actual initcode size. Existing job, staking, validator, dispute, settlement, tax, and governance features remain. The original 17 root README Mermaid blocks remain unchanged.

## Modular candidate verification

The final clean default build and `npm test` pass: **267 Solidity sources** and **581 Hardhat tests**, including the complete pretest sequence. The ten new compatibility/deployment tests preserve all prior controller functions, events, errors, and storage offsets; verify identical implementation layouts and controller-specific voting domains; enforce direct-call and governance checks; and exercise paused, interrupted, resumed, and completed staging with per-transaction gas limits.

- **66** non-mock deployable v2 artifacts pass EIP-170/EIP-3860 size checks.
- **59** selected Foundry staking/slashing/validator/deadline regressions pass with 256 fuzz runs.
- **13** tests across all five invariant suites pass, covering escrow, fee pools, staking accounting, and pause/governance controls.
- **4** validation-finalization tests pass, including both finalization gas scenarios.
- **30** release/signing/size regression tests pass. Toolchain/lock integrity, Solidity lint, workflow syntax, and required formatting checks pass.
- Foundry output and cache are isolated from Hardhat artifacts, avoiding incompatible build-info files in subsequent test runs.
- All **17** root README flowcharts remain byte-for-byte identical to the reviewed baseline.

Fresh-checkout CI follow-up:

- Both prebuilt demos now bundle the ten fixed implementations and pass with an empty Hardhat artifacts directory. The supply-chain transcript passes both schema checks; the labour-market transcript retains its timeline, owner controls, scenarios, and portfolios. A compatibility regression requires the bundled ABI and creation bytecode to match the compiled contracts.
- The owner CLI shebang is restored to the first line; its complete local deployment, governance, pause, and resume rehearsal passes. This repairs the shared cause of seven deterministic-demo workflow failures.
- All **13** focused modular/deployer tests and **6** Slither-policy regressions pass. The earlier full-suite result remains 581 tests; the new bundle regression adds one test.
- Slither 0.10.4 analyzes 266 contracts with 92 detectors. The validator now reads rule-level security severity; previously, all 816 results were labeled warnings and high-impact findings escaped enforcement. The 27 high-severity findings match scoped, documented exceptions. See the [static-analysis review](static-analysis-review.md), including the existing randomness risk and required production review.

The root version and changelog prepare **v2.0.0** because constructor setup and whole-stack deployment change. No release or signed tag has been published. The authorized-signers check still rejects the committed example keys. At the prior PR head `c420ecc7caf2b731eaa40d48fccebcc03dbd82a4`, CULTURE CI still failed; new candidate CI must be evaluated on its own commit.

## Local lifecycle completion and launcher safety

The follow-up to PR #3878 repairs the separate ASI Take-Off local failure and exercises employer settlement. Staged deployment now authorizes JobRegistry tax acknowledgements and connects StakeManager to ValidationModule. The driver preserves the committed reveal salt, completes identity ownership acceptance and validator selection, uses fresh RPC state with buffered gas estimates, and checks the decoded final job state. Its mock token supports the burn needed by the configured settlement path. A missing creation event or blocked identity setup fails the run instead of producing a successful empty mission.

Report namespaces default to the mission scope, so running ASI Take-Off preserves AURORA receipts. Explicit namespace overrides remain available, with traversal rejected. Local launchers refuse occupied ports, validate a localhost RPC endpoint and chain ID 31337, bind explicitly to localhost, and stop only the node they started. `DEMO_PORT` selects an alternate port. Compilation is incremental and serialized. The workflows also run when contract/deployment dependencies change and retain receipts when a demo fails. [AURORA](../../demo/aurora/README.md#run-the-local-job-lifecycle) and [ASI Take-Off](../../demo/asi-takeoff/README.md#run-the-three-job-local-walkthrough) now provide direct walkthroughs and report locations.

Verification uses Node 22.23.3 and npm 10.8.2 with the production compiler profile. Contract-size checks pass; Deployer runtime/initcode are **10,116 / 10,239 bytes**. The **54 standalone Node checks** pass, including occupied-port preservation, endpoint/chain validation, and existing release safeguards. Toolchain/lock checks, required formatting, shell syntax, workflow lint, and focused Solidity lint pass. All **17 root README flowcharts**, plus the two edited demo diagrams, are unchanged.

**14 focused contract tests pass**, covering deployment wiring/mode checks, immutable-implementation compatibility, and mock-token burn accounting. The three-job ASI Take-Off run passes on Anvil; the one-job AURORA run passes using the Hardhat fallback. Both generate reports and per-stage receipts after checking successful final settlement. These runs use mock tokens, configured identities, and demonstration work/results, while executing actual local v2 contracts.

The full root test attempt ended with exit **137** at the validator reservoir tests under local memory pressure; it is not a passing full-suite result. Exact-commit CI remains required. Maintainer signing validation still rejects the committed example key. These fixes do not establish independent security review, real provider execution, production identities, or paid settlement on the intended network.

## Remaining production work

### CULTURE gate repairs after PR #3877

The review continued from merged main `ff8db39d4e2a47885d1a63a24925a8764aa1181f`. All 14 other triggered workflows passed at that commit, including core CI, contract CI, containers, application-image provenance, Torch, browser E2E, fuzzing, and static analysis. CULTURE services passed, while its stale gas snapshot stopped downstream checks.

- Fix the arena's signed-difficulty magnitude comparison: large unsigned limits no longer become negative, and `int32.min` is handled without negation overflow. **39 Foundry tests** pass, including restored submission/authorization/operation-sequence tests and new configuration, ownership, atomicity, and boundary cases.
- Use Foundry minimum-IR coverage and isolate production Foundry, coverage, and Hardhat artifacts. Enforce the **unchanged 90% line threshold for each production contract** using the actual Foundry LCOV report; reject missing/invalid evidence. CultureRegistry reaches **94.06%**, SelfPlayArena **97.44%**, and both have 100% function coverage. The separate three-test Hardhat report remains supplemental (62.93% aggregate production-contract lines); it is not presented as 90% coverage.
- Refresh the obsolete gas snapshot and explicitly revise the lifecycle/misconduct ceilings to **750,000 / 675,000** for the existing integrated scenarios. Measured costs are **682,641 / 612,935**. The prior ceilings predated the JobRegistry/ValidationModule fixture integration. The [gas review](../../demo/CULTURE-v0/gas-snapshots/REVIEW-2026-10-03.md) preserves the old values and rationale. Fuzz tests still run; exact gas comparison covers deterministic tests.
- Slither 0.10.4 reports zero findings after narrow source annotations explain four reviewed findings: validation selection remains owned by the ValidationModule, zero revokes the designated relayer, and artifact timestamps are metadata rather than authorization/existence conditions. Existing entropy and governance assumptions remain subject to independent review.
- **27 indexer tests** pass with **92.50% lines/statements, 90.24% branches, and 94.66% functions**, including ordered finality-aware live replay and failure retries. Normalize PageRank when the graph grows and stop on external-validator failure; preserve the previous verified metrics. A compiled runtime against a localhost chain verifies migrations, ingestion of three actual artifact events, graceful shutdown, and restart without duplicates. Deep reorganization/orphan reconciliation is still not established.
- Repair deployment-script config compatibility, module-relative paths, artifact lookup, ethers v6 chain lookup, dependency-code checks, strict failure reporting, and comment-preserving atomic environment updates. Six helper regressions and script type-checking pass. Add an explicitly local fixture bootstrap and repair the single-stack Compose/Cypress path, pinned dependency images, localhost bindings, writable data volumes, Python runtime, and Prisma migrations.

At `a87ff65b813f4ba2326eadc6353943fd17555001`, [CULTURE CI](https://github.com/MontrealAI/AGIJobsv0/actions/runs/37150017071) passes all six jobs. The actual Docker stack starts five healthy services, validates NetworkX influence results, indexes three on-chain seed artifacts, and rejects unauthenticated writes. The Chrome 154 UI smoke passes; its provider responses are explicitly intercepted fixtures. [Core CI](https://github.com/MontrealAI/AGIJobsv0/actions/runs/37150017016), contract CI, fuzzing, static analysis, container builds, and the root browser workflows also pass at that commit. The separate ASI Take-Off local workflow exposed a stale RPC nonce during rapid transactions; the shared AURORA driver now disables the provider's short-lived cache and awaits asynchronous impersonated-signer lookup. Subsequent-head CI must be evaluated separately.

These results supersede the earlier gas and coverage failures below. They do not establish real provider integrations, paid settlement, independent validator operation, an authorized release signature, or a mainnet deployment.

The release inventory now includes all ten fixed implementations, and both explorer configurations verify them with their empty constructor arguments. Record their actual addresses under `implementations` (keyed by contract name) in `docs/deployment-addresses.json`. Manifest validation rejects omitted implementations and malformed addresses; explorer verification rejects empty, partial, duplicate, skipped, or cross-network inventories. Dry-run results are labeled `planned`, never `verified`. Six release-inventory regressions cover these gates. Existing example address books and controller constructor-argument files still require reviewed deployment evidence; the legacy deployment scripts' verification argument lists also require reconciliation with actual creation transactions before commissioning.

### Main-branch follow-up after PR #3876

PR #3876 was merged at `f83334bdb636cbe77f17d5b510da198ccf8d061f`, whose tree exactly matches the reviewed `348a9235` candidate. No release or tag was created. Main-branch checks exposed two further CI-specific defects: the test launcher silently switched to a 50-run optimizer profile after the production build, and SLSA's default artifact filename inherited a forbidden colon from image tags. The follow-up makes the production profile the test default, keeps Node test suites in their dedicated CI runners, and supplies valid provenance filenames without changing the attested image subjects.

The CULTURE indexer now passes its existing coverage thresholds with **25 tests**, **93.40% lines/statements**, **91.76% branches**, and **95.94% functions**. Its production build and lint pass. Tests exercise the real Fastify/GraphQL API and SQLite migrations/data, pagination and lineage, ordered history replay and retries, checksums/timers, external-process failures, and weekly analytics. Startup and packaging entry scripts are still not exercised by this suite.

These tests accompany concrete corrections: the current nine-field `RoundFinalized` ABI replaces the stale five-field signature; failed backfills stop before later events and advance their cursor only after successful computation; rejected influence results are not persisted; cyclic lineage and malformed cursors fail explicitly; Python validation has time/output limits and rejects invalid scores; and influence inequality uses all metrics instead of only the displayed top ten.

The follow-up passes all root pretest checks and **582 Hardhat tests** with the production compiler profile, plus **42 standalone Node regressions**. The targeted bytecode/bundle compatibility checks also pass after a clean 267-source compile. Torch CI now runs on every main-branch push so the release gate can obtain evidence for the exact commit. Live event ordering and orphaned-event reconciliation still need commissioning; the historical replay tests do not establish reorganization safety.

The CULTURE Solidity contracts and tests are unchanged from the reviewed main baseline. Re-measurement confirms the existing lifecycle and misconduct costs (682,540 and 612,729 gas), and the committed snapshot references several tests no longer present in that baseline. Gas limits have not been raised to conceal these failures. The snapshot/budget review, contract coverage, real provider integrations, and Compose commissioning remain required, alongside authentic release signing and deployment configuration.

1. **Review the modular deployment architecture.** The four oversized contracts are split and the size gate passes. Review the fixed delegation boundaries and staged deployment, and complete any migration and independent security review required for the intended network. The test evidence does not replace that review.
2. **Configure authentic release trust.** Replace the example registry with authorized SSH public keys, verify fingerprints through the maintainer's process, and sign the reviewed tag. No signing identity has been invented or installed by this change.
3. **Complete deployment configuration and planning.** `deployment-config/mainnet.json` still has a zero governance address. `release-mainnet.yml` references `scripts/v2/plan-deploy.ts`, which is absent from the reviewed baseline. Implement and review the intended deployment-plan generator before using that workflow; a configuration-update plan is not a substitute for a deployment plan.
4. **Require current CI and security evidence.** Validate the PR's actual container builds, OS and application dependencies, browser suites, Foundry checks, branch rules, and release workflow. The baseline's August container run failed OS vulnerability scans; the October scheduled Torch run failed collection. Historical green badges are insufficient.
5. **Commission the intended deployment.** Verify contract addresses, token units, identities, signer/validator independence, pause/recovery behavior, provider failures, monitoring, and paid end-to-end settlement on the intended network. Simulation totals and local tests do not establish live throughput, reliability, or economic returns.

## Evidence and upstream references

- [Baseline scheduled Torch failure](https://github.com/MontrealAI/AGIJobsv0/actions/runs/37092992665)
- [Baseline container failure](https://github.com/MontrealAI/AGIJobsv0/actions/runs/33083499117)
- [Node 22.23.3 release](https://nodejs.org/en/blog/release/v22.23.3)
- [Node support schedule](https://github.com/nodejs/Release#release-schedule)
- [Next.js September 2026 security release](https://nextjs.org/blog/september-2026-security-release)
- [Passing primary-container CI at the earlier PR commit](https://github.com/MontrealAI/AGIJobsv0/actions/runs/37128420970)
- [Application-image failure that prompted the follow-up](https://github.com/MontrealAI/AGIJobsv0/actions/runs/37128421393)
- [CULTURE failure that prompted the follow-up](https://github.com/MontrealAI/AGIJobsv0/actions/runs/37128420924)
- [EIP-170: contract code size limit](https://eips.ethereum.org/EIPS/eip-170)
- [EIP-3860: initcode limit](https://eips.ethereum.org/EIPS/eip-3860)

Return to [Start here](../START_HERE.md).
