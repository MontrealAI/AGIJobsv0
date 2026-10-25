# Modular CI lattice

The v2 status wall is now publishable from three modular workflows that mirror the production “lint”, “tests”, and “analytics” strata. Each workflow exposes the same job names that appear on the live status wall so that branch protection rules can target individual assurance pillars without reading a monolithic YAML file.

## Workflow layout

| Workflow | Purpose | Status wall jobs |
| --- | --- | --- |
| `ci / lint lattice` | Toolchain conformance, linting, and governance guardrails. | `Lint & static checks`, `HGM guardrails`, `Owner control assurance`, `Branch protection guard`, `CI summary`. |
| `ci / test lattice` | Contract compilation, unit tests, coverage enforcement, and invariant fuzzing. | `Tests`, `Foundry`, `Coverage thresholds`, `Invariant tests`, `CI summary`. |
| `ci / analytics lattice` | Python intelligence suite, Monte Carlo simulations, and coverage aggregation. | `Python unit tests`, `Python integration tests`, `Load-simulation reports`, `Python coverage enforcement`, `CI summary`. |

Each workflow emits a Markdown artefact in `reports/ci/` (`lint-lattice.md`, `test-lattice.md`, `analytics-lattice.md`) and uploads it as a build artefact. Release management can subscribe to these artefacts without scraping Actions logs.

## Trigger strategy

The modular workflows run on `pull_request`, `push` to `main`, and manual `workflow_dispatch` invocations. Path filters keep the workflows focused on relevant code paths so governance-only changes do not needlessly execute the Foundry or Python suites.

- Lint lattice: watches core scripts, manifests, contracts, and governance documentation.
- Test lattice: watches contract sources, test harnesses, and Hardhat/Foundry configuration.
- Analytics lattice: watches Python requirements, simulation modules, and Python test directories.

Use `workflow_dispatch` to rehearse a single lattice during release triage without triggering the full CI fan-out.

## Branch protection mapping

1. Follow the instructions in [`docs/BRANCH_PROTECTION.md`](../BRANCH_PROTECTION.md) to add the new status contexts alongside the existing `ci (v2)` wall.
2. Run the verification scripts locally after updating the protection rule:

   ```bash
   npm run ci:verify-contexts
   npm run ci:verify-companion-contexts
   npm run ci:verify-branch-protection -- --branch main
   ```

   These commands ensure the JSON manifests in `ci/` stay synchronised with the modular workflows.

3. Keep the legacy `ci (v2)` contexts in place until the monolithic workflow is decomposed or deleted. The branch protection guard reports both sets, making it obvious when a context drifts out of sync.

## Local rehearsal

To execute the same commands locally, source `.nvmrc` and Python 3.12, then run the scripts used by each job:

```bash
npm run ci:preflight
./scripts/ci/npm-ci.sh --no-audit --prefer-offline --progress=false
npm run lint:ci
npm test
npm run coverage
pytest test/paymaster test/tools test/orchestrator test/simulation
```

`yamllint` and `npx actionlint` are recommended before committing workflow edits; the CI automation enforces the same formatting rules when `ci / lint lattice` runs on `main`.
