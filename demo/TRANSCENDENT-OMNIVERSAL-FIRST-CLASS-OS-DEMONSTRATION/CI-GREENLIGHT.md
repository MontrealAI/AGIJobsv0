# CI Greenlight Checklist – Transcendent Omniversal Demo

This checklist ensures your branch meets the CI v2 contract before opening or merging a pull request. All commands run locally and map directly to required GitHub workflows.

## 1. Core Gate Rehearsal

Run the same jobs that `ci.yml` enforces:

```bash
npm run lint:ci
npm test
npm run coverage
npm run check:access-control
forge test -vvvv --ffi --match-path 'test/v2/invariant/**' --fuzz-runs 512
npm run demo:asi-takeoff
```

- `npm run lint:ci` mirrors the **Lint & static checks** job (formatting, ESLint, monitoring templates).
- `npm test` matches the **Tests** job executed after Hardhat compilation.
- `npm run coverage` plus `npm run check:access-control` enforces the 90% coverage floor and access-control remapping the pipeline expects.
- `forge test ...` aligns with the **Invariant tests** stage configured in `ci.yml`.
- `npm run demo:asi-takeoff` reproduces the **ASI Take-Off Demo** job’s deterministic rehearsal.

## 2. Front-End Assurance

The `webapp.yml` workflow requires the front-end bundle to build, lint, and pass end-to-end tests. Mirror those gates locally:

```bash
npm run webapp:lint
npm run webapp:typecheck
npm run webapp:build
npm run webapp:e2e
```

## 3. Containers & Supply Chain

`containers.yml` and `static-analysis.yml` validate container builds and SBOM integrity. Execute the corresponding scripts:

```bash
npm run build:gateway
npm run sbom:generate
npm run verify:wiring
```

## 4. Branch Protection Audit

1. Export a GitHub token with `repo` scope: `export GITHUB_TOKEN=<token>`.
2. Run the automated audit:
   ```bash
   npm run ci:verify-branch-protection
   ```
   The script confirms that the following contexts are required on `main` and on pull requests:
   - Lint & static checks
   - Tests
   - Foundry
   - Coverage thresholds
   - ASI Take-Off Demo
   - Zenith Sapience Demo
   - Celestial Archon Demo
   - Hypernova Governance Demo
   - Invariant tests
   - CI summary
   - e2e.yml (end-to-end tests)
   - fuzz.yml (Foundry fuzzing)
   - webapp.yml (web front-ends)
   - containers.yml (container security)
   - static-analysis.yml (code scanning)

   Any missing context produces a ❌ line in the report.

## 5. Evidence Capture

- Archive the terminal transcripts (or `ci:verify-branch-protection` JSON output) alongside the demo mission bundle.
- Attach the logs to your pull request to prove local rehearsal of CI.

Completing this checklist guarantees your branch will sail through GitHub’s required checks and keeps `main` permanently green.
