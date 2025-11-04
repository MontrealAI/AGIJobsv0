# Changelog

All notable changes to this project will be documented in this file.

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
