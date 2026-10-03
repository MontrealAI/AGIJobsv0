# Production readiness review — 2026-10-03

Reviewed baseline: `7049353e1ee13c19b97365b269f9a9ac1800434c`, with the accompanying readiness-hardening changes. This is an engineering verification record, not an independent security audit or a claim that the full vision has been proven in production.

**Decision: suitable for continued local development and demonstration; not ready for a mainnet release.** Mainnet deployability fails on compiled bytecode size, and release trust is not configured. Existing features, examples, and diagrams are preserved.

## Verified locally

| Check | Result |
| --- | --- |
| Supported root toolchain | Node 22.23.3, npm 10.8.2; toolchain and lockfile checks pass |
| Solidity compilation | 253 source files compile with the repository's default optimizer/viaIR settings |
| Full `npm test` | Pretest checks and 571 Hardhat tests pass |
| Python repository suite | 246 passed, 1 skipped |
| Focused recursive-model suite | 13 passed |
| New release guard regressions | 12 passed: signed/unsigned/untrusted/wrong-commit tags, shell metacharacters, malformed keys, and bytecode-size boundaries and empty artifacts |
| Gateway and orchestrator builds and runtime packaging | Pass; 4 packaging regressions pass |
| Owner console production build | Pass |
| CI context synchronization, summary coverage, formatting and targeted lint | Pass |
| Demo gallery | 41 runnable suites exercised; three initial failures repaired and all affected suites pass on rerun |
| Root README flowcharts | All 17 Mermaid blocks identical to the reviewed baseline |

The demo runner skips some suites when their independent toolchains are absent. Foundry and Prisma-dependent tests were not run here; the Phase-8 browser tests were skipped because Chromium was unavailable. A successful aggregate run must not be described as browser or Foundry validation. Docker is unavailable in the local environment, so container builds and vulnerability scans require the pull request's container workflow.

## Repairs included

- The scheduled Torch workflow installed the optional Streamlit dashboard after FastAPI. That second installation replaced Starlette 0.41.3 with an incompatible 1.7.0 and caused nine collection errors. Headless model requirements are now separate, installed with the platform requirements in one resolver invocation, followed by `pip check`. Relevant pull requests trigger this check.
- Compiled runtime packaging now includes the gateway config helpers and gRPC schema. The gateway and orchestrator launch commands now point to their emitted server entrypoints; compilation alone had not caught these startup failures.
- Node 20 pins were updated to supported Node 22.23.3 across the root toolchain, workflows, Dockerfiles, and explicit-version instructions. The Node doctor no longer reports an exact matching pin as a mismatch.
- The container workflow now uses supported primary base images and a current Trivy scanner, gives its matrix jobs stable required-context names, scans PR builds, and scans both published architectures before promoting a candidate to `latest`. Existing application-library scans remain advisory; green OS scans are not a complete dependency-security sign-off.
- Release verification parses actual OpenSSH public keys, invokes Git without shell interpolation, checks trust and the checkout commit, and applies to manual releases too. Invalid placeholder signing bytes no longer pass validation.
- Production releases and mainnet preparation enforce EIP-170 runtime and EIP-3860 initcode limits. Invalid or empty Safe-plan JSON is no longer replaced with a successful-looking empty object.
- Demo tests isolate inherited environment variables and network probes. The reasoner subprocess disables host startup customizations with Python `-I -S`. Its tests use the configured default memory allowance and separately assert failure under memory exhaustion. This subprocess is still a trusted demonstration harness, not a security boundary for arbitrary hostile programs.

## Mainnet size gate

Run `npm run compile`, then `npm run release:check-size`. The latter currently exits **1**, intentionally. It examines 56 non-mock deployable v2 artifacts from this build.

| Contract | Runtime bytes | Runtime limit | Initcode bytes | Initcode limit |
| --- | ---: | ---: | ---: | ---: |
| JobRegistry | 48,855 | 24,576 | 51,813 | 49,152 |
| StakeManager | 45,337 | 24,576 | 46,928 | 49,152 |
| ValidationModule | 28,199 | 24,576 | 29,925 | 49,152 |
| Deployer | 234,082 | 24,576 | 234,207 | 49,152 |

The local Hardhat network sets `allowUnlimitedContractSize: true`. This supports development tests but masks an Ethereum deployment constraint. Constructor arguments also contribute to actual initcode size; passing the artifact-only size gate is necessary, not sufficient. The gate does not verify artifact freshness: release workflows compile first.

## Remaining production work

1. **Refactor the oversized contracts.** Split responsibilities into deployable modules/libraries or another explicitly reviewed architecture while preserving accounting, access control, storage/migration rules, and required ABI behavior. Re-run lifecycle, invariant, gas, and strict-size deployment tests. Simply changing a badge or raising a local limit cannot repair this.
2. **Configure authentic release trust.** Replace the example registry with authorized SSH public keys, verify fingerprints through the maintainer's process, and sign the reviewed tag. No signing identity has been invented or installed by this change.
3. **Complete deployment configuration and planning.** `deployment-config/mainnet.json` still has a zero governance address. `release-mainnet.yml` references `scripts/v2/plan-deploy.ts`, which is absent from the reviewed baseline. Implement and review the intended deployment-plan generator before using that workflow; a configuration-update plan is not a substitute for a deployment plan.
4. **Require current CI and security evidence.** Validate the PR's actual container builds, OS and application dependencies, browser suites, Foundry checks, branch rules, and release workflow. The baseline's August container run failed OS vulnerability scans; the October scheduled Torch run failed collection. Historical green badges are insufficient.
5. **Commission the intended deployment.** Verify contract addresses, token units, identities, signer/validator independence, pause/recovery behavior, provider failures, monitoring, and paid end-to-end settlement on the intended network. Simulation totals and local tests do not establish live throughput, reliability, or economic returns.

## Evidence and upstream references

- [Baseline scheduled Torch failure](https://github.com/MontrealAI/AGIJobsv0/actions/runs/37092992665)
- [Baseline container failure](https://github.com/MontrealAI/AGIJobsv0/actions/runs/33083499117)
- [Node 22.23.3 release](https://nodejs.org/en/blog/release/v22.23.3)
- [Node support schedule](https://github.com/nodejs/Release#release-schedule)
- [EIP-170: contract code size limit](https://eips.ethereum.org/EIPS/eip-170)
- [EIP-3860: initcode limit](https://eips.ethereum.org/EIPS/eip-3860)

Return to [Start here](../START_HERE.md).
