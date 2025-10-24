# Security Tooling Triage – March 2025

Date: 2025-03-18

## Summary

| Tool | Status | Notes |
| --- | --- | --- |
| Slither | ⚠️ Blocked | Requires Foundry `forge`; environment lacks binary (`slither contracts`) |
| Mythril | ⚠️ Blocked | Dependency resolution cancelled to avoid 56MB z3 download | 
| npm audit | ✅ Completed | 33 vulnerabilities (21 low, 12 moderate); major issues stem from legacy `web3` stack |
| Snyk | ⚠️ Blocked | CLI installed but authentication required (`snyk test`) |

## Slither

*Command*: `slither contracts`

*Outcome*: Fails with `FileNotFoundError: [Errno 2] No such file or directory: 'forge'` because the Foundry toolchain is not installed inside the CI container.

*Action*: Documented requirement to install Foundry or use Dockerized slither image in future runs.

## Mythril

*Command*: `pip install mythril`

*Outcome*: Installation attempted but cancelled to avoid large dependency pull (`z3-solver` ~57MB) within constrained runtime. No analysis executed.

*Action*: Recommend running Mythril in dedicated security pipeline with cached dependencies.

## npm audit

*Command*: `npm audit --omit=dev`

*Outcome*: 33 known vulnerabilities surfaced, primarily within legacy Web3 dependencies (`got`, `min-document`, `web3-core-*`, `tmp`).

*Existing Mitigations*: Production builds rely on patched Hardhat pathways; legacy packages are isolated behind internal allowlists (`SECURITY.md`).

*Action*: Track upstream fixes for `react-force-graph`/`web3` stack; consider migrating remaining tooling to maintained alternatives.

## Snyk

*Command*: `snyk test`

*Outcome*: CLI reports authentication error `SNYK-0005` because no API token is configured.

*Action*: Integrate with org-wide Snyk service account when running in CI.

