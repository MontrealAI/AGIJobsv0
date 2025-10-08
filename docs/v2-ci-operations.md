# AGI Jobs v0 — CI v2 Operations Guide

This guide describes the CI v2 pipeline that protects the AGI Jobs v0 codebase. It documents the workflows that run on `main` and every pull request, shows how the jobs depend on each other, and captures the branch protection settings that need to be enforced so the checks are always visible.

```mermaid
digraph CIv2 {
  rankdir=LR;
  node [shape=rect, style=rounded, fontsize=12];
  Lint[label="Lint & static checks" ];
  Tests[label="Hardhat tests" ];
  Foundry[label="Foundry fuzzing" ];
  Coverage[label="Coverage thresholds" ];
  Summary[label="CI summary" shape=parallelogram];

  Lint -> Summary;
  Tests -> Foundry;
  Tests -> Coverage;
  Tests -> Summary;
  Foundry -> Summary;
  Coverage -> Summary;
}
```

## Workflow triggers

The [`ci.yml`](../.github/workflows/ci.yml) workflow runs when:

- A pull request targets `main`.
- A push lands on `main`.
- A maintainer manually triggers a run with **Run workflow**.

These triggers ensure every change to production code surfaces in the pipeline and the final **CI summary** job remains visible in the PR checks list.

## Required jobs and branch protection

Enable branch protection on `main` with these required status checks:

| Check name | Source job | Notes |
| --- | --- | --- |
| `Lint & static checks` | `lint` job | Blocks merge when linting fails. |
| `Tests` | `tests` job | Runs Hardhat compilation and the main test suite. |
| `Foundry` | `foundry` job | Always runs after the `tests` job, even when it fails, to expose fuzz failures. |
| `Coverage thresholds` | `coverage` job | Enforces `COVERAGE_MIN` and access-control coverage. |
| `CI summary` | `summary` job | Fails when any dependency job fails so the PR badge stays red. |

> ✅ **Tip:** In GitHub branch protection, mark `Require branches to be up to date` to guarantee pull requests re-run the workflow when `main` advances.

## Pull request hygiene checklist

1. Confirm that the **Checks** tab shows all five required jobs in the table above.
2. Inspect the **Artifacts** section for `coverage-lcov` when coverage needs auditing.
3. Review the `CI summary` job output for a condensed Markdown table of job results.
4. When re-running failed jobs, choose **Re-run failed jobs** to keep historical logs.

## Local dry run for contributors

Developers can approximate the pipeline locally with:

```bash
npm ci
npm run format:check
npm run lint:ci
npm test
npm run coverage
forge test -vvvv --ffi --fuzz-runs 256
```

Running the commands in this order matches the GitHub workflow dependencies, letting contributors catch failures before opening a pull request.

## Operational playbook

- **Incident response:** When a CI job fails on `main`, triage by inspecting the job logs, then open an incident ticket using the `owner-control-change-ticket.md` template.
- **Temporarily skipping jobs:** Use GitHub's `workflow_dispatch` trigger to run a targeted branch with fixes instead of editing the workflow file.
- **Infrastructure updates:** Record any changes to cache keys or environment variables in `docs/release-checklist.md` and attach a PR link for traceability.

## Audit checkpoints

- CI secrets should be scoped to read-only access; verify them quarterly and record the review in `docs/owner-control-audit.md`.
- Review branch protection rules weekly to ensure required checks still match the workflow job names.
- Capture coverage threshold decisions in `docs/green-path-checklist.md` so downstream owners understand the rationale for the configured `COVERAGE_MIN`.

Maintaining these guardrails keeps AGI Jobs v0 deployable by non-technical stakeholders while satisfying the "fully green" CI expectation.
