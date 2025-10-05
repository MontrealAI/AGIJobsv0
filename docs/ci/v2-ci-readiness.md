# AGI Jobs v2 CI Readiness Checklist

This note explains how the GitHub Actions workflows keep the AGI Jobs v2
stack production ready. Each workflow now shares a common caching strategy,
pinning, and health checks so maintainers can quickly confirm that the v2
deployment path is green end-to-end.

## Workflow inventory

| Workflow | Purpose | Key checks |
| --- | --- | --- |
| `contracts-ci` | Solidity compilation, TypeScript helpers, Hardhat and Foundry test suites. | Generates constants with `scripts/generate-constants.ts`, runs the full `npm test` suite, and executes Foundry fuzz tests for v2 contracts. |
| `webapp` | Owner console and enterprise portal front-ends. | Type checks, ESLint, Vite/Next.js builds, and Cypress E2E coverage. |
| `e2e` | Orchestrator plus v2 integration drills. | Spins up Anvil, runs hardhat integration suites (`test/v2/*.integration.*`), and performs forked job lifecycle tests. |
| `fuzz` | Nightly fuzz coverage. | Compiles the contracts and replays the Foundry fuzzing harnesses to harden the CommitReveal, Stake, Fee, and Slashing logic. |
| `apps-images` | Runtime containers. | Builds and scans the owner console and enterprise portal images with Trivy and SLSA provenance. |
| `orchestrator-ci` | Type-safety guard for the orchestrator TypeScript service. | Enforces `tsc` without emitting code. |

## Deterministic environments

- All Node-dependent jobs now run on the same Ubuntu 24.04 image so we can
  reason about libc, glibc, and OpenSSL compatibility when debugging runs.
- The jobs rely on `actions/setup-node@v4` with caching across every
  `package-lock.json` in the repository (root, console, portal). This makes
  dependency resolution identical between CI and local development while
  trimming installation time.
- Cypress is cached via `~/.cache/Cypress` so front-end smoke tests no longer
  redownload binaries on every attempt.

## Keeping runs green

- If a job fails because dependencies change, refresh the lockfiles and push a
  PR so the shared cache key updates. Caches are scoped per-branch thanks to the
  hash of all lockfiles, preventing cross-branch contamination.
- `npm ci` is used everywhere to enforce deterministic dependency trees. Avoid
  `npm install` in CI unless you intentionally add or update packages.
- Each workflow uploads key artefacts (`owner-console-dist`, `e2e-logs`,
  container digests) to simplify debugging and handover to non-technical
  operators.

By following this checklist you can assert that all v2 critical paths remain
deployment-ready and that production cutovers inherit the same rigor exercised
in CI.
