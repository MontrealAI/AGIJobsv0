# Branch Protection Policy (AGI Jobs v2)

Keeping `main` deployable hinges on two pillars: every workflow that enforces a production invariant must report a required check, and every pull request must be rebased on top of the latest `main` before merging.

## Required status checks

Enable **Require status checks to pass before merging** and select the contexts in the table below. The names are exactly as they appear in the GitHub UI (`<workflow name> / <job id>`).

| Workflow | Job id | Check label in UI | Purpose |
| --- | --- | --- | --- |
| `ci (v2)` | `lint` | `Lint & static checks` | Prettier, ESLint, Solhint with production rules. |
| `ci (v2)` | `tests` | `Tests` | Hardhat compilation, ABI drift detection, main unit tests. |
| `ci (v2)` | `foundry` | `Foundry` | Forge fuzzing with deterministic constants. |
| `ci (v2)` | `coverage` | `Coverage thresholds` | 90% line coverage + access-control guard. |
| `ci (v2)` | `summary` | `CI summary` | Aggregated Markdown gate—fails when any dependency job fails. |
| `contracts-ci` | `compile-and-test` | `contracts-ci / compile-and-test` | Contract-only smoke tests triggered on targeted changes. |
| `fuzz` | `forge-fuzz` | `fuzz / forge-fuzz` | Independent Foundry fuzz suite (nightly + PR). |
| `e2e` | `orchestrator-e2e` | `e2e / orchestrator-e2e` | Full orchestrator + Cypress flows on anvil. |
| `webapp` | `webapp-ci` | `webapp / webapp-ci` | Owner console + enterprise portal build, lint, Cypress. |
| `containers` | `build` | `containers / build` | Multi-image Docker build + scan. |
| `apps-images` | `console` | `apps-images / console` | Owner console image build + Trivy enforcement. |
| `apps-images` | `portal` | `apps-images / portal` | Enterprise portal image build + Trivy enforcement. |
| `release` | `prepare` | `release / prepare` | Release prep guard—enable only on release branches/tags. |

> The `security` workflow referenced in older runbooks has been superseded by Trivy scans inside `apps-images` and the Docker pipeline. No additional standalone check is required.

Turn on **Require branches to be up to date before merging** so GitHub re-runs the latest pipelines after `main` advances. Keep **Dismiss stale pull request approvals when new commits are pushed** enabled to ensure reviewers re-acknowledge changes.

## Verification from the CLI

Run the following commands after updating the branch protection screen to ensure the configuration matches expectations:

```bash
gh api repos/:owner/:repo/branches/main/protection --jq '{required_status_checks: .required_status_checks.contexts}'
gh api repos/:owner/:repo/branches/main/protection --jq '{strict: .required_status_checks.strict, enforce_admins: .enforce_admins.enabled}'
```

The first command should return the exact check list above. The second confirms that admins are also blocked when checks fail and that “Require branches to be up to date” is active.

## Additional rules

1. **Require approvals** from CODEOWNERS (minimum one reviewer). For high-risk areas (contracts, deploy tooling, owner console) consider two approvals.
2. **Require signed commits** to improve provenance (recommended when using a Safe or multi-sig bot).
3. **Restrict who can push** – disable direct pushes to `main` and limit who can dismiss reviews.
4. **Require linear history** to keep audit diffs simple.

Mirror this policy onto any long-lived release branches (for example `release/v2`) so that hotfixes respect the same guardrails. Update `CODEOWNERS` whenever ownership of a subsystem changes so reviewers are automatically requested.
