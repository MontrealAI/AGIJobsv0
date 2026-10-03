# Changelog

All notable changes to this project will be documented in this file.

## v2.0.0

- Include all ten fixed implementations in release manifests and explorer verification; reject incomplete or cross-network verification inventories and label dry runs as plans.

Release candidate prepared on 2026-10-03; publication remains subject to the release gates.

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
