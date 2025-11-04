# Branch protection enablement

This guide explains how to enable GitHub branch protection so that the status
wall emitted by the `ci (v2)` family of workflows becomes a hard gate for
merges.

## 1. Configure the GitHub rule

1. Navigate to **Settings → Branches → Branch protection rules**.
2. Add a rule targeting `main` (or edit the existing one).
3. Enable the following options:
   - ✅ **Require a pull request before merging**
   - ✅ **Require status checks to pass before merging**
   - ✅ **Require branches to be up to date before merging**
   - ✅ **Require conversation resolution before merging**
   - (Optional) Enable **Restrict who can push to matching branches** if the
     repository requires administrator enforcement.
4. In the *Status checks that are required* section, add the entries from
   [`ci/required-contexts.json`](../ci/required-contexts.json) and
   [`ci/required-companion-contexts.json`](../ci/required-companion-contexts.json).
   The display names in those manifests match the GitHub check titles, so you
   can paste them directly when editing the rule.

> ℹ️ GitHub only shows checks that have run at least once on the default branch.
> Trigger the workflows on `main` after creating new entries to make them
> available in the rule editor.

## 2. Map modular workflows to required checks

| Workflow file | Required status check | Manifest source |
| ------------- | -------------------- | --------------- |
| `.github/workflows/ci-lint.yml` | `ci (v2) / Lint & static checks` | `ci/required-contexts.json` |
| `.github/workflows/ci-tests.yml` | `ci (v2) / Tests` | `ci/required-contexts.json` |
| `.github/workflows/ci-simulation.yml` | `ci (v2) / Python unit tests`, `ci (v2) / Python integration tests`, `ci (v2) / Load-simulation reports`, `ci (v2) / Python coverage enforcement` | `ci/required-contexts.json` |

When editing the branch protection rule, select each check listed above. GitHub
will automatically enforce that all dependent jobs succeed before the merge
button is enabled.

## 3. Keep the rule in sync

Run the following scripts locally (requires Node.js 18+):

```bash
npm run ci:sync-contexts -- --check
npm run ci:verify-contexts
npm run ci:verify-companion-contexts
```

These commands fail if the workflow job names diverge from the manifests. After
updating branch protection through the API or UI, you can double check with:

```bash
GITHUB_TOKEN=<token> npm run ci:verify-branch-protection -- --owner MontrealAI --repo AGIJobsv0 --branch main
```

The verification script ensures the live rule references every required status
entry and that the modular workflows remain enforceable.
