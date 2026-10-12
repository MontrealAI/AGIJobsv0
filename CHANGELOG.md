# Changelog

## v2.1.0-rc.5

Mainnet deployment record and welcoming example source candidate (2026-10-12).

- Publish a dated, evidence-qualified inventory of all 24 existing Ethereum mainnet contracts, their deployed rc.4 source identity, constructor arguments and compiler/artifact provenance.
- Record completion of **24/24 exact-match Etherscan source verifications**, including the final StakeManagerEscrow success; preserve earlier partial results as history.
- Separate recorded paused governance and runtime-template comparison from explorer source publication and live-service commissioning; retain unresolved ownership and commissioning boundaries.
- Link the address directory from the repository overview, readiness record, deployment guides and generated Pages documentation. The existing AGIALPHA deployment remains distinct from AGIJobManager/ENSJobPages USDC.
- Include the previously merged English/French garden-club example and reading improvements from #3923.
- Stabilize the existing concurrent-budget regression test by waiting for the first driver call before testing the outstanding reservation; runtime enforcement and assertions remain intact.
- Reconcile the operational address book with all 24 deployed contracts, including ten implementations; mark disabled/absent modules as zero, correct the owner-verifier default path, and prevent zero-valued monitoring templates from replacing recorded addresses.
- Bind the canonical book to mainnet: other owner-verification chains use a chain-specific book or explicit overrides, and monitoring ignores a book tagged for another network. Local demos do not probe mainnet addresses by default.
- Align the mainnet parameter-change sentinel with disabled TaxPolicy: monitor the three deployed emitters and retain both TaxPolicyUpdated event conditions; validate and render all sentinel templates against the recorded inventory.

This source prerelease does not change Solidity, deployment configuration, settlement rules or dependencies, and sends no blockchain transaction. Production signing and independent security/provider/worker commissioning remain unresolved. All existing demos and flowcharts are preserved.

## v2.1.0-rc.4

Dependency remediation and storage-publisher migration source candidate (2026-10-11).

- Update Handlebars, CycloneDX and Cypress; remove the obsolete nested EAS Hardhat toolchain while preserving the selected compiler, contract libraries and root Hardhat identities.
- Maintain a provenance-checked Braces 3.0.3 depth-limit patch, locally identified as `3.0.4-agi.1`, with original-crash, differential and upstream regression tests. This is a downstream patch, not a published upstream fix; exceptionally deep patterns now fail with a controlled error. Root container installs receive the same verified archive.
- Migrate the three Node release publishers from legacy Web3.Storage bearer tokens to an explicitly delegated Storacha upload agent. Validate CAR roots and same-root upload-index readback, retain that confirmation in deployment history, and do not claim storage-deal verification or automatic rollback.
- Require exact-source dependency qualification and unchanged full/production audit thresholds. Moderate and low findings remain; audit success alone does not certify the local patch or establish production readiness.
- Compare preservation against each PR's merge base and qualify changes to the release-audit implementation, keeping protected source and dependency-identity checks enforced as main evolves.

Solidity, economic behavior, compiler/network/deployment settings, demos and diagrams are preserved. Maintainer signing, independent review and live commissioning remain outstanding. Upload credentials must migrate; the browser legacy uploader and orchestrator provider defaults still require separate migration/commissioning. No public-chain deployment is included.

## v2.1.0-rc.3

Guided onboarding completion source candidate (2026-10-11).

- Add English/French help that follows the current step and chosen route, with plain explanations and no time pressure.
- Keep saved-draft and print options in native, keyboard-accessible expandable sections so the main action remains easy to find.
- Edit a finished request directly; copy the exact readable brief with a selected-text fallback when clipboard access is unavailable.
- Preserve newer edits and navigation when asynchronous copying completes late; keep all draft, authorization and session formats compatible.
- Strengthen whole-card keyboard focus and verify clipboard/download parity, keyboard disclosure, narrow layouts and both languages through the existing Pages gate.

This source preview does not change contracts, settlement, dependencies or deployment scripts. Production signing, dependency remediation, independent review and live commissioning remain outstanding. Automated checks do not establish billion-user capacity or replace usability testing with older and nontechnical participants.

## v2.1.0-rc.2

- Added read-only governance call preparation for launch limits; the configuration helper supports the staged SystemPause topology and legacy delegated-pauser topology, preserves omitted job limits and handles mixed pause states.

Deployment safety and operator documentation source candidate (2026-10-10).

- Add an atomic paused handoff for all eight SystemPause-managed contracts while retaining legacy coordinator entrypoint behavior.
- Commit the resolved deployment configuration on the coordinator; refuse changed recovery parameters and mismatched coordinator runtime.
- Validate public-network configuration, pinned chain/token dependencies and current production compiler evidence before broadcasting.
- Reserve fresh evidence, retain submitted transaction hashes and append-only recovery checkpoints, and regenerate reports for finalized deployments.
- Install reviewed tax metadata before handoff; report actual chain values, pending ownership and incomplete explorer verification.
- Compile the selected network's token constants before artifacts, including in production release preparation.
- Replace outdated current deployment instructions with the supported Hardhat path and a plain-language coordinator guide. Preserve historical diagrams and mark the Truffle path as historical.

Production signing, dependency remediation, independent review and live commissioning remain required. Existing deployed contracts and token economics are not migrated by this source release.

## Onboarding refinement — 2026-10-10

- Preserve bounded same-tab progress and larger-text preference across refreshes and EN/FR changes; explain blocked storage and provide reversible clearing.
- Undo examples, reopen simple editable drafts in the guide, and save/print a readable work request without technical planner setup. Advanced drafts retain their full-planner route.
- Respect browser font preferences, strengthen keyboard focus, keep enlarged text and controls inside narrow screens, and provide a direct mobile guide shortcut.
- Exercise recovery, rejected imports, printing, text spacing and all-step enlarged-text layouts in the existing Pages gate. Live-service and production qualification boundaries remain explicit.

## Source preview — guided onboarding (2026-10-10)

- Dedicated English and French welcome pages with four plain-language journeys, large controls, larger text and useful examples.
- Downloadable editable job drafts and an explicit same-tab handoff into the existing planner; no wallet, account, payment or live job submission.
- Prominent entry points in the repository, homepage, navigation and setup guide; original demos and flowcharts retained.
- Keyboard, responsive-layout, accessibility, validation and draft-transfer regression checks in Pages CI.
- This source preview does not waive the existing production signing, dependency, review or commissioning requirements.

## v2.1.0-rc.1 — SUCCESSOR Ω release candidate

- Add a shared mission constitution, 21 coverage templates, five-stage SEIZE record, sealed job compiler and dependency invalidation registry.
- Run three local missions: invoice integrity, bounded symbolic WORLD discovery, and sequential evidence/resource planning. Preserve unsafe candidates and cases where a conventional alternative removes claimed advantage.
- Add complete candidate freezes, separately runnable signed evaluation, explicit admission/authority mechanics and a fixture-only action broker with SQLite reservations, restart reconciliation and revocation.
- Preserve schemaVersion 1 computer-work tasks while requiring separate sealed mission bindings. Link actual local-chain settlement receipts to exact work-order/report bytes without converting payment into mission proof.
- Export and verify JSON Mission Packs; restore negative knowledge and create a successor without inherited permissions. Add actual bounded substitution of two local formation algorithms.
- Add EN/FR SUCCESSOR workbenches while preserving existing demo routes and Mermaid sources.

The first source baseline was published before implementation as `source-v2.0.0-baseline.1`. This candidate introduces no token migration, contract storage change or commissioned live SUCCESSOR authority. Independent examination, production signing, dependency remediation and remote worker commissioning remain separate gates; see [release notes](docs/successor/release-notes.md).

## Demo experience expansion — 2026-10-04

- Add source-grounded walkthroughs, expected results, experiments, troubleshooting and verification links for all 76 demo/support entries.
- Add read-only, searchable source inspection with exact downloads and SHA-256 provenance.
- Publish all tracked demo Markdown documents and standalone flowcharts, expanding the site to 300 guides and 244 preserved diagrams.
- Verify 16 selected Python demo recipes and expand browser coverage to every individual mobile experience.

All notable changes to this project will be documented in this file.

## v2.0.0

- Publish the Demo Observatory through a tested GitHub Pages workflow: a responsive searchable collection, individual demo pages, sanitized original guides with locally bundled Mermaid, and a clearly labeled browser lifecycle simulation with rejection paths and downloadable receipts.

- Add a searchable catalog of all demo directories and registered commands, with setup, output paths, troubleshooting, and explicit design-guide labels. Preserve existing scenarios and flowcharts.
- Make ASI Global and Atlas Conductor run actual local settlement with their original mixed validator committees; validate every configured job and payout, guard legacy placeholders behind explicit fixture opt-in, and preserve unrelated local processes.
- Exercise all discovered Python demo suites in CI, isolate test-runtime selection, and handle optional dependency-probe timeouts without aborting the demo runner.

- Include all ten fixed implementations in release manifests and explorer verification; reject incomplete or cross-network verification inventories and label dry runs as plans.

Release candidate prepared on 2026-10-03; publication remains subject to the release gates.

- Add an isolated production rehearsal with signing rejection scenarios, actual HTTP provider fault injection, adversarial contract checks, local settlement, and signed simulation evidence. Require exact-commit rehearsal CI before production publication.
- Stop provider failures and unconfigured synthetic results before gateway upload/signing/submission. Retain explicit synthetic execution on connected local chains, bound HTTP response handling, and package the native ESM IPFS-client bridge.

- Keep default AURORA and ASI Take-Off report directories separate so running one demo does not overwrite the other's receipts.
- Make AURORA and ASI Take-Off launchers verify a disposable localhost chain, refuse occupied ports without killing other processes, support an alternate port, and stop only their own node. Add direct walkthroughs and retain every existing flowchart.
- Complete staged tax-policy authorization and validator-stake wiring. Keep Deployer's mode guards separate from common wiring to avoid duplicated bytecode. Make the AURORA/ASI Take-Off local driver complete identity handoff, validator selection, committed-salt reveal, and employer settlement; reject skipped missions and missing job receipts.
- Address CULTURE review findings around environment precedence, credential ignores, startup database selection, and empty-block checkpoints; preserve failed-batch retry safety. Export all fixed implementation addresses and exact staged creation arguments for release verification.
- Repair duplicated Omega scenario validation declarations from a historical merge; retain positive reward validation and all diagrams.
- Repair CULTURE signed-difficulty boundaries, restore lifecycle/security tests, enforce per-contract coverage, and refresh the gas baseline with an explicit historical review.
- Make live indexing ordered and confirmation-aware, normalize growing-graph influence, stop on validator outages, and verify migration/ingestion/restart against real local-chain events.
- Repair CULTURE deployment configuration and runtime startup; provide an explicit local fixture stack with persistent state, localhost bindings, and actual ingestion/authentication checks alongside the UI walkthrough.

- Split JobRegistry, StakeManager, and ValidationModule into fixed implementations while preserving their runtime APIs and storage offsets. Constructor setup now includes implementation addresses.
- Replace the oversized one-transaction deployer with paused, resumable component deployment and atomic final wiring.
- Enforce Ethereum contract-size limits in the normal Hardhat network and contract CI; preserve existing features and flowcharts.
- Add public-ABI, storage-layout, domain-separation, authorization, direct-call, and deployment-resumption regressions.
- Preserve no-compile demos with bundled implementation bytecode and artifact-drift checks; repair the owner rehearsal CLI entrypoint.
- Enforce Slither's actual SARIF security severity and document scoped delegation exceptions and existing randomness risks.
- Align CI tests with the production compiler profile, isolate Node test suites from Mocha, and use portable provenance artifact names for application images.
- Repair CULTURE indexer event decoding and recovery, reject cyclic lineage and malformed cursors, bound external validation, and compute inequality across the full graph; raise measured indexer coverage above the existing 90% gate through behavioral tests.

- Enforce exact-commit release CI, contract verification, scan-before-signing, draft-before-publication, and prerelease-safe image promotion; update Cosign/provenance verification and portable checksums.
- Close the CULTURE studio API coverage gap with error/default-path tests and fix arena lint in clean installations.

- Update Next.js applications to 15.5.27 and repair independent application-image builds and provenance subjects.
- Repair CULTURE service builds, lint integration, lockfiles, Prisma generation, and packaging; add authenticated arena writes, receipt-derived round IDs, atomic state persistence, and explicit preview/service modes.
- Correct CULTURE coverage percentages and document its remaining gas, coverage, provider, and deployment-integration blockers without weakening the gates.
- Repair compiled gateway/orchestrator entrypoints and package required config helpers, public config, and the gRPC schema.
- Move the pinned root toolchain and primary container builds to Node 22.23.3 LTS; fix the Node doctor's false mismatch warning.
- Separate headless recursive-model dependencies from the optional dashboard, resolve platform and model requirements together, check dependency consistency, and test relevant pull requests.
- Verify real SSH public keys and signed tags without shell interpolation; require the signed tag to match the checkout for both automatic and manual releases.
- Add a production bytecode-size gate to release and mainnet preparation. The four previously oversized contracts now fit Ethereum limits; deployment and lifecycle tests run with those limits enforced.
- Scan container candidates before promoting `latest`, including both published architectures, refresh the OS scanner and primary base images, and align matrix job names with the required-context manifest.
- Add an operator entry guide and dated evidence report; preserve existing features, diagrams, and examples.

## v2

- Hardened the CI workflow so the Tests, Foundry, and Coverage thresholds jobs run on Ubuntu 24.04, regenerate generated constants when needed, enforce the 90% coverage gate without being skippable, publish `coverage/lcov.info` artifacts for inspection, and execute the full Hardhat coverage suite so access-control modules are accounted for.
- Documented the CI status badge in the README and enabled dependency-lock-aware npm caching in every job to keep the gate fast while remaining enforceable on `main` and pull requests.
- Bumped all `contracts/v2` module `version` constants to `2` and updated related checks and documentation.
- `RandaoCoordinator.random` now mixes the XORed seed with `block.prevrandao` for block-dependent entropy.
- Default identity cache durations for agents and validators are now zero so every job application and validation commit requires a fresh ENS proof; governance can extend the cache via on-chain setters if necessary.
- Added scripted ABI exports with diff checking, ensured coverage enforcement scripts skip gracefully when artifacts are absent, and vendored forge-std so Foundry fuzzing runs without extra setup.
- Expanded the Python coverage harness with worker and simulation regression tests and ensured the editable `hgm_core` package is installed via `requirements-python.txt` so the CI parity instructions stay reproducible.

## v1

- Updated Solidity compiler to version 0.8.21 across contracts, configuration, and docs.
- Updated dependencies: Node.js 22.x LTS, Hardhat 2.26.1, @nomicfoundation/hardhat-toolbox 6.1.0, and OpenZeppelin Contracts 5.4.0.
- Introduced AGIJobManagerV1 contract and updated deployment script.
- Expanded README with security notice and toolchain verification steps.
- Standardised on 18‑decimal `$AGIALPHA` token at `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`; token swapping instructions marked as legacy.
- Removed legacy `MockERC20SixDecimals` test token following 18‑decimal migration.

## v0

- Initial release of AGIJobManager with core job management, reputation, and NFT marketplace features.
