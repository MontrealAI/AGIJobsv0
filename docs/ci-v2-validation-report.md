# CI v2 Validation Report

This log captures the reproducible validation sequence for AGI Jobs v0 (v2)'s second-generation CI surface. It is structured so a non-technical owner can re-run the exact checks that keep the platform production-ready while preserving full control of the system parameters, pause levers, and upgrade governance.

## Scope and guarantees

- ✅ Confirms every pinned toolchain component and lockfile alignment that the CI depends on.
- ✅ Exercises the JavaScript/TypeScript linting lattice, ensuring Solidity linting, Prettier formatting, and sentinel template validation succeed together across their dedicated commands.
- ✅ Drives the full `npm test` contract + application harness, covering orchestrator owner controls, pause switches, and the validator coordination engines that the owner can reconfigure at runtime.
- ✅ Documents the output artefacts so branch protection and the CI summary gate remain fully auditable and visible on pull requests and on `main`.

These steps augment the permanent references in [`docs/v2-ci-operations.md`](v2-ci-operations.md) and [`docs/ci-v2-branch-protection-checklist.md`](ci-v2-branch-protection-checklist.md).

## Reproduction steps

1. **Install dependencies**

   ```bash
   npm ci --no-audit --prefer-offline --progress=false
   ```

   This ensures the locally pinned toolchain mirrors the CI runner before any tests execute.

2. **Verify toolchain locks**

   ```bash
   npm run ci:verify-toolchain
   ```

   Confirms Node, Hardhat, Foundry, and auxiliary binaries remain pinned. A passing run prints `✅ Toolchain lock verification passed. All required versions are pinned.`

3. **Run lint and static checks**

   ```bash
   npm run lint:ci
   ```

   Solhint and ESLint must report zero warnings. Any deviation indicates drift that would surface on pull requests.

4. **Confirm formatting alignment**

   ```bash
   npm run format:check
   ```

   Prettier verifies that the repository formatting matches the enforced CI baseline. Fix any reported files with `npm run format` before re-running the validation sequence.

5. **Validate sentinel monitoring templates**

   ```bash
   npm run monitoring:validate
   ```

   Ensures the monitoring sentinels used for on-chain and service regressions continue to compile. A successful run mirrors the dedicated CI matrix step and is required for a green pipeline badge.

6. **Execute the full Node/Hardhat suite**

   ```bash
   npm test
   ```

   This single command drives the orchestrator, owner control, validator governance, and Hardhat contract suites. It re-generates constants, compiles contracts, enforces ABI stability, and exercises the owner pause/resume controls that the contract owner can trigger from the CLI or dashboards.

7. **Publish artefacts**
   Upload the generated reports under `reports/` (for example the CI summary JSON) when running inside GitHub Actions so non-technical maintainers can inspect the run without reading logs.

## Branch protection alignment

After validating the local run, audit branch protection (requires a token with `repo` scope):

```bash
npm run ci:verify-branch-protection -- --token <GITHUB_TOKEN_WITH_REPO_SCOPE>
npm run ci:enforce-branch-protection -- --dry-run
```

Ensure the output contexts exactly match [`ci/required-contexts.json`](../ci/required-contexts.json). When the report shows the full context set, administrators and contributors cannot bypass the CI v2 matrix, keeping every job visible and required on `main` and all pull requests.【F:ci/required-contexts.json†L1-L23】

When the dry run looks correct, rerun `npm run ci:enforce-branch-protection` without `--dry-run` to push the manifest, strict status checks, and administrator enforcement back to GitHub automatically using the GraphQL API.【F:scripts/ci/enforce-branch-protection.ts†L1-L279】

## Operational notes

- The CI badge in [`README.md`](../README.md) reflects the latest `ci (v2)` run. A red badge signals that at least one job in the matrix needs attention.
- The owner can pause or resume the protocol, rotate signers, and update fees by following the playbooks in [`docs/orchestration.md`](orchestration.md) while relying on this checklist to ensure no deployment bypasses the verified pipeline.
- Archive each validation report inside your release or change-management artefacts to preserve compliance evidence and accelerate audits.

> **Reminder:** Rerun this validation whenever toolchain versions, contract governance parameters, or branch protection rules change. This keeps the CI v2 surface fully green and enforced for every merge, guaranteeing that the platform remains the superintelligent control fabric it is engineered to be.
