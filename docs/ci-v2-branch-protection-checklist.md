# CI v2 Branch Protection Checklist

> **Audience:** Repository administrators, release captains, and governance stewards who must prove that the "ci (v2)" workflow is fully enforced on `main`.
>
> **Goal:** Provide a repeatable audit that verifies branch protection mirrors the workflow job names, that administrators cannot bypass checks, and that the CI summary gate remains the single source of truth for non-technical reviewers.

---

## Required status contexts

| Context | Source job | Why it matters |
| --- | --- | --- |
| `ci (v2) / Lint & static checks` | [`lint`](../.github/workflows/ci.yml) | Blocks merges when formatting, ESLint, or Solhint find issues before tests run.【F:.github/workflows/ci.yml†L28-L60】 |
| `ci (v2) / Tests` | [`tests`](../.github/workflows/ci.yml) | Runs Hardhat compilation, the unit test suite, ABI drift detection, and constants regeneration.【F:.github/workflows/ci.yml†L62-L116】 |
| `ci (v2) / Foundry` | [`foundry`](../.github/workflows/ci.yml) | Executes fuzz tests after unit tests, even when they fail, to expose property violations.【F:.github/workflows/ci.yml†L118-L165】 |
| `ci (v2) / Coverage thresholds` | [`coverage`](../.github/workflows/ci.yml) | Enforces ≥90 % coverage and access-control reporting while publishing LCOV artifacts.【F:.github/workflows/ci.yml†L167-L216】 |
| `ci (v2) / CI summary` | [`summary`](../.github/workflows/ci.yml) | Aggregates upstream job results into a single ✅/❌ indicator required by branch protection.【F:.github/workflows/ci.yml†L218-L233】 |
| `static-analysis / Slither static analysis` | [`slither`](../.github/workflows/static-analysis.yml) | Fails the merge if Slither reports unapproved high-severity findings and uploads SARIF to the security tab.【F:.github/workflows/static-analysis.yml†L20-L106】 |
| `static-analysis / CodeQL analysis` | [`codeql`](../.github/workflows/static-analysis.yml) | Ensures CodeQL JavaScript/TypeScript scans succeed with the hardened config and SARIF upload before merges land.【F:.github/workflows/static-analysis.yml†L108-L157】 |

The job display names in GitHub Actions must stay in sync with these contexts. Any rename requires updating branch protection and this checklist.

---

## Verification steps

### 1. Inspect branch protection in the GitHub UI

1. Navigate to **Settings → Branches**.
2. Edit the rule that applies to `main`.
3. Under **Require status checks to pass before merging**, verify the seven contexts above appear in the list, in order.
4. Confirm the following toggles are enabled:
   - **Require branches to be up to date before merging**
   - **Require linear history**
   - **Dismiss stale pull request approvals when new commits are pushed**
   - **Require approvals** with at least one **Code owner review**
   - **Require conversation resolution before merging**
   - **Include administrators**
5. In the **Rules applied to everyone** section, ensure **Restrict who can push to matching branches** only allows GitHub Actions (via the merge queue) and automated service accounts. Human pushes must remain blocked.
6. Capture a screenshot or export the configuration for your change-control records.

### 2. Confirm enforcement with the GitHub CLI

Run the automated audit (set `GITHUB_TOKEN` or `GH_TOKEN` with `repo` scope first):

```bash
npm run ci:verify-branch-protection
```

- `npm run audit:final -- --full` runs this verifier automatically when assembling the release dossier, keeping non-technical owners aligned with branch policy. The command also records the outcome in `reports/audit/final-readiness.json` for auditors who track freeze evidence across releases.【F:scripts/audit/final-readiness.ts†L1-L305】

- Save the ✅/❌ table output in your change ticket. It proves the required contexts, ordering, strict mode, and administrator enforcement all align with policy.
- Pass `--owner`, `--repo`, or `--branch` flags when checking forks or release candidates.

Prefer the GitHub CLI? These commands remain acceptable alternatives:

```bash
gh api repos/:owner/:repo/branches/main/protection --jq '{required_status_checks: .required_status_checks.contexts}'
gh api repos/:owner/:repo/branches/main/protection --jq '.enforce_admins.enabled'
```

- The first command must output the seven contexts exactly as listed in the table above.
- The second must print `true`, proving administrators cannot bypass the checks.
- Record the command output (copy/paste or redirect to a dated text file) for auditors.

### 3. Validate the CI summary gate

1. Open **Actions → ci (v2)** and select the latest successful run on `main`.
2. Verify the `CI summary` job lists every upstream job (Lint, Tests, Foundry, Coverage) with matching outcomes.
3. Confirm the job is marked as **Required** in the run header. If it is missing, update branch protection immediately and re-run the workflow to refresh the badge.
4. When troubleshooting, re-run the workflow with **Re-run failed jobs** so historical logs remain intact for incident reviews.

### 4. Double-check companion workflows

If your governance policy also requires `e2e`, `fuzz`, `webapp`, or `containers` workflows, repeat the UI and CLI verification to ensure their contexts are enforced. Document any optional workflows in the change ticket associated with the release.

### 5. Validate secret scanning & push protection

1. Navigate to **Settings → Code security and analysis**.
2. Confirm both **Secret scanning** and **Secret scanning → Push protection** display the "Enabled" badge (green check icon).
3. If either control is disabled, open a Sev2 governance ticket and enable the feature immediately. Production releases must block commits that expose credentials.
4. Record screenshots of the enabled state and attach them to the same change ticket that stores the branch protection audit.

---

## Remediation playbook

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| A context is missing from the CLI output | Workflow job renamed or branch rule edited | Update the branch rule via GitHub UI or `gh api`, then rerun this checklist. |
| `CI summary` not marked as required | Branch rule removed the summary context | Add `ci (v2) / CI summary` back to the required list and save. |
| Administrators can merge with red checks | **Include administrators** disabled | Enable the toggle and document the change in `owner-control-change-ticket.md`. |
| Workflow run shows stale job names | Cached UI state | Refresh the page or open the run in a private window to confirm the latest metadata. |

---

## Change management

- Run this checklist whenever `.github/workflows/ci.yml` changes job names or when GitHub introduces new workflow UI features.
- Store completed checklists (including CLI outputs) in the governance document vault referenced by the [Production Readiness Index](production/deployment-readiness-index.md).
- Update this document in the same pull request that changes workflow job names so auditors have a single source of truth.

Maintaining this checklist alongside the CI v2 operations guide keeps branch protection verifiable for non-technical owners and satisfies the "fully green" enforcement requirement mandated by REDENOMINATION.
