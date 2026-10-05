# CI Green Operations Manual

A green signal must identify the commit, the checks that actually ran, and their scope. The theatre's offline checks do not certify a deployed marketplace or a live OpenClaw worker.

## 1. Targeted checks

Use Python 3.10+; pytest is needed only for tests, not for the runner:

```bash
python3 -m pip install pytest==8.4.2
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest -q demo/astral-omnidominion-operating-system-command-theatre/tests
python3 demo/astral-omnidominion-operating-system-command-theatre/run_demo.py
python3 demo/astral-omnidominion-operating-system-command-theatre/run_demo.py --verify-report reports/astral-omnidominion-operating-system-command-theatre/report.json
```

The dedicated [Astral command theatre workflow](../../.github/workflows/demo-astral-command-theatre.yml) tests supported Python versions, runs the rehearsal, verifies the evidence and retains the report artifacts. The existing [Demo gallery](../../.github/workflows/demo-gallery.yml) also discovers this Python suite. Tests include corrupted evidence, incorrect arithmetic, operator pause, incomplete documents, malformed catalogs, path traversal and report escaping.

## 2. Repository-wide required checks

The canonical required check names are in [ci/required-contexts.json](../../ci/required-contexts.json) and [ci/required-companion-contexts.json](../../ci/required-companion-contexts.json). Read those manifests and the current workflow runs rather than copying a stale list of job names into this guide.

For maintainers with permission to read branch protection:

```bash
npm run ci:verify-branch-protection
```

This is a read-only verification command. Lack of API permission is an access limitation, not evidence that branch protection is absent. A demo-specific workflow is not automatically a required merge gate; repository policy controls that separately.

## 3. Full-stack local parity

Use the repository's pinned Node/npm setup and locked dependencies first. Run checks relevant to changes in shared contracts, webapps or orchestration:

```bash
npm run lint:ci
npm test
npm run coverage
npm run check:coverage
npm run check:access-control
npm run webapp:build
npm run webapp:typecheck
npm run webapp:e2e
```

`webapp:e2e` manages its build and preview server. Foundry coverage/fuzzing has its own toolchain; use `FOUNDRY_PROFILE=ci forge test` where required. The first-class demonstration runs compilation/simulation/owner stages; it **does not invoke this complete suite** and cannot substitute for it.

## 4. Stack health and failure response

1. Find the failing job and exact commit. Retain its logs.
2. Reproduce the actual failing command with the pinned toolchain.
3. Fix the cause and add a regression test when behavior is affected.
4. Rerun the relevant rehearsal; inspect `steps[]` rather than treating skipped stages as passes.
5. Compare artifact hashes and reviewer outcomes; a coherent manifest alone is insufficient.
6. Attach evidence and CI run URLs to the PR. Merge only under the repository's required checks.

For the Docker stack, inspect `docker compose ps` and individual service logs. Review any credential/configuration change before regenerating environment files or rebuilding images. Never publish `.env`, provider tokens or private keys in CI artifacts.
