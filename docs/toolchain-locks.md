# Toolchain Lock Strategy

To guarantee reproducible builds and satisfy the institutional-readiness punch-list, the
AGI Jobs v0 (v2) toolchain is **explicitly pinned**. This document explains the locked
versions, how they are enforced, and the safe procedure for updating them.

## Locked versions

| Tool | Version | Enforcement | Notes |
| --- | --- | --- | --- |
| Node.js | 20.18.1 | `.nvmrc`, `package.json` `engines.node`, CI `actions/setup-node` steps, and `npm run ci:verify-toolchain` | Matches Active LTS. Changing the file requires bumping `package-lock.json` via `npm ci` under the new runtime. |
| Foundry toolchain | v1.4.4 | `./.github/actions/install-foundry` composite action pins `v1.4.4` via `foundryup`; `ci:verify-toolchain` asserts the pin | Guarantees that `forge`/`anvil`/`cast` behave consistently across CI, fuzzing, and release pipelines. |

## Why the lock matters

* **Deterministic builds** – auditors can rebuild bytecode and artefacts with confidence
  years in the future.
* **Supply-chain assurance** – security attestations (SBOM, provenance) reference specific
  compiler stacks, closing gaps in the release chain-of-custody.
* **Operator guidance** – non-technical operators have one canonical runtime to install
  when following runbooks.

## Updating a toolchain version

1. **Plan the upgrade**
   * Review upstream release notes for Node.js and Foundry.
   * Ensure dependent docker images or managed services support the target version.
2. **Update version pins**
   * Modify `.nvmrc` and `package.json` for Node.
   * Update every `actions/setup-node` step if a new file path is introduced.
   * Change the `version` input for the Foundry toolchain in all workflows.
3. **Refresh lockfiles and artefacts**
   * Run `nvm use` (or `fnm`, etc.) to activate the pinned Node version locally.
   * Execute `npm ci` followed by the standard `npm run compile` / `npm test` suites.
   * Regenerate any cached artefacts (TypeChain, ABIs) if required by the upgrade.
4. **Re-run the full CI suite**
   * Push a dedicated PR and ensure all workflows remain green.
   * Pay special attention to fuzzing and coverage jobs to confirm no behaviour drift.
5. **Document the upgrade**
   * Update this file with the new version numbers and relevant release notes.
   * Capture the change in `CHANGELOG.md` under the "Maintenance" section.

## Verification checklist

Before merging a toolchain update, confirm:

- [ ] CI builds the contracts deterministically twice (e.g., by re-running `ci.yml`).
- [ ] Coverage reports remain above enforced thresholds.
- [ ] Gas snapshots do not regress unexpectedly, or the diffs are explained.
- [ ] Deployment and emergency runbooks have been spot-checked under the new toolchain.

Following this process ensures that production deployments continue to meet the
"Institutional Deployment Readiness" standard while avoiding "works on my machine"
regressions.
