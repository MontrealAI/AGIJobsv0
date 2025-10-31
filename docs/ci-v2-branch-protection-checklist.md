# CI v2 Branch Protection Checklist

> **Audience:** Repository administrators, release captains, and governance stewards who must prove that the "ci (v2)" workflow is fully enforced on `main`.
>
> **Goal:** Provide a repeatable audit that verifies branch protection mirrors the workflow job names, that administrators cannot bypass checks, and that the CI summary gate remains the single source of truth for non-technical reviewers.

---

## Required status contexts

### Core execution gate

| Context | Source job | Why it matters |
| --- | --- | --- |
| `ci (v2) / Lint & static checks` | [`lint`](../.github/workflows/ci.yml) | Blocks merges when formatting, ESLint, or Solhint find issues before tests run.【F:.github/workflows/ci.yml†L28-L60】 |
| `ci (v2) / Tests` | [`tests`](../.github/workflows/ci.yml) | Runs Hardhat compilation, the unit test suite, ABI drift detection, and constants regeneration.【F:.github/workflows/ci.yml†L62-L116】 |
| `ci (v2) / Foundry` | [`foundry`](../.github/workflows/ci.yml) | Executes fuzz tests after unit tests, even when they fail, to expose property violations.【F:.github/workflows/ci.yml†L278-L336】 |
| `ci (v2) / Coverage thresholds` | [`coverage`](../.github/workflows/ci.yml) | Enforces ≥90 % coverage and access-control reporting while publishing LCOV artifacts.【F:.github/workflows/ci.yml†L338-L386】 |
| `ci (v2) / Invariant tests` | [`invariants`](../.github/workflows/ci.yml) | Exercises the dedicated invariant harness with Foundry to prove critical properties across fuzzed states.【F:.github/workflows/ci.yml†L952-L1120】 |

### Python intelligence lattice

| Context | Source job | Why it matters |
| --- | --- | --- |
| `ci (v2) / Python unit tests` | [`python_unit`](../.github/workflows/ci.yml) | Covers paymaster, tools, orchestrator, and simulation tests under coverage.【F:.github/workflows/ci.yml†L118-L188】 |
| `ci (v2) / Python integration tests` | [`python_integration`](../.github/workflows/ci.yml) | Exercises API routes and demo orchestrations with shared coverage.【F:.github/workflows/ci.yml†L190-L258】 |
| `ci (v2) / Load-simulation reports` | [`python_load_sim`](../.github/workflows/ci.yml) | Generates Monte Carlo load sweeps and fails if dissipation deviates from guardrails.【F:.github/workflows/ci.yml†L260-L318】 |
| `ci (v2) / Python coverage enforcement` | [`python_coverage`](../.github/workflows/ci.yml) | Combines and audits unit/integration coverage, exporting XML artefacts for auditors.【F:.github/workflows/ci.yml†L320-L378】 |

### Governance & readiness demonstrations

| Context | Source job | Why it matters |
| --- | --- | --- |
| `ci (v2) / HGM guardrails` | [`hgm_guardrails`](../.github/workflows/ci.yml) | Exercises Higher Governance Machine guardrails across Node + Python stacks so access control stays enforceable.【F:.github/workflows/ci.yml†L380-L450】 |
| `ci (v2) / Phase 6 readiness` | [`phase6`](../.github/workflows/ci.yml) | Validates the Phase 6 manifest and UI bundle so migrations remain deterministic.【F:.github/workflows/ci.yml†L452-L486】 |
| `ci (v2) / Phase 8 readiness` | [`phase8`](../.github/workflows/ci.yml) | Confirms the expansion manifest stays reproducible for the Phase 8 release kit.【F:.github/workflows/ci.yml†L488-L522】 |
| `ci (v2) / Kardashev II readiness` | [`kardashev_demo`](../.github/workflows/ci.yml) | Replays both Kardashev II demos to ensure cinematic onboarding assets remain reproducible.【F:.github/workflows/ci.yml†L524-L574】 |
| `ci (v2) / ASI Take-Off Demonstration` | [`asi_takeoff_demo`](../.github/workflows/ci.yml) | Executes the ASI take-off deterministic kit, archiving artefacts for institutional reviewers.【F:.github/workflows/ci.yml†L576-L642】 |
| `ci (v2) / Zenith Sapience Demonstration` | [`zenith_demo`](../.github/workflows/ci.yml) | Runs deterministic and local Zenith Sapience rehearsals to prove end-to-end orchestration.【F:.github/workflows/ci.yml†L644-L722】 |
| `ci (v2) / AGI Labor Market Grand Demo` | [`agi_labor_market_demo`](../.github/workflows/ci.yml) | Produces the labour market transcript export consumed by policy teams.【F:.github/workflows/ci.yml†L724-L768】 |
| `ci (v2) / Sovereign Mesh Demo — build` | [`sovereign_mesh_demo`](../.github/workflows/ci.yml) | Builds the Sovereign Mesh orchestrator server and React console to detect drift.【F:.github/workflows/ci.yml†L770-L812】 |
| `ci (v2) / Sovereign Constellation Demo — build` | [`sovereign_constellation_demo`](../.github/workflows/ci.yml) | Builds the Sovereign Constellation artefacts to guarantee rehearsal readiness.【F:.github/workflows/ci.yml†L814-L856】 |
| `ci (v2) / Celestial Archon Demonstration` | [`celestial_archon_demo`](../.github/workflows/ci.yml) | Rehearses deterministic and local Celestial Archon flows for sovereignty drills.【F:.github/workflows/ci.yml†L858-L928】 |
| `ci (v2) / Hypernova Governance Demonstration` | [`hypernova_demo`](../.github/workflows/ci.yml) | Exercises Hypernova deterministic + local flows to protect governance rehearsals.【F:.github/workflows/ci.yml†L930-L970】 |

### Policy enforcement & summary

| Context | Source job | Why it matters |
| --- | --- | --- |
| `ci (v2) / Branch protection guard` | [`branch_protection`](../.github/workflows/ci.yml) | Calls the GitHub API to verify branch protection matches these contexts and keeps administrators gated.【F:.github/workflows/ci.yml†L872-L1044】 |
| `ci (v2) / CI summary` | [`summary`](../.github/workflows/ci.yml) | Aggregates upstream job results into a single ✅/❌ indicator and surfaces permitted skips for forked PRs.【F:.github/workflows/ci.yml†L905-L1010】 |

### Companion workflows

| Context | Source job | Why it matters |
| --- | --- | --- |
| `static-analysis / Slither static analysis` | [`slither`](../.github/workflows/static-analysis.yml) | Fails the merge if Slither reports unapproved high-severity findings and uploads SARIF to the security tab.【F:.github/workflows/static-analysis.yml†L20-L106】 |
| `static-analysis / CodeQL analysis` | [`codeql`](../.github/workflows/static-analysis.yml) | Ensures CodeQL JavaScript/TypeScript scans succeed with the hardened config and SARIF upload before merges land.【F:.github/workflows/static-analysis.yml†L108-L157】 |

The job display names in GitHub Actions must stay in sync with these contexts. Any rename requires updating branch protection and this checklist. The lint stage now executes `npm run ci:verify-contexts` to fail fast when `.github/workflows/ci.yml` and `scripts/ci/verify-branch-protection.ts` drift, giving administrators an immediate signal before a PR reaches review.【F:.github/workflows/ci.yml†L53-L60】【F:scripts/ci/check-ci-required-contexts.ts†L1-L107】

---

## Verification steps

### 1. Inspect branch protection in the GitHub UI

1. Navigate to **Settings → Branches**.
2. Edit the rule that applies to `main`.
3. Under **Require status checks to pass before merging**, verify the full context set above appears in the list, in order.
4. Confirm **Require branches to be up to date before merging** and **Include administrators** are enabled. Both are required for audit compliance.
5. Capture a screenshot or export the configuration for your change-control records.

### 2. Confirm enforcement with the GitHub CLI

Run the automated audits (set `GITHUB_TOKEN` or `GH_TOKEN` with `repo` scope first):

```bash
npm run ci:verify-contexts
npm run ci:verify-branch-protection
```

- `npm run ci:verify-contexts` parses `.github/workflows/ci.yml` and confirms every job name maps to a required status context, preventing silent drift when contributors rename jobs.【F:scripts/ci/check-ci-required-contexts.ts†L1-L107】
- `npm run audit:final -- --full` runs this verifier automatically when assembling the release dossier, keeping non-technical owners aligned with branch policy. The command also records the outcome in `reports/audit/final-readiness.json` for auditors who track freeze evidence across releases.【F:scripts/audit/final-readiness.ts†L1-L305】

- Save the ✅/❌ table output in your change ticket. It proves the required contexts, ordering, strict mode, and administrator enforcement all align with policy.
- Pass `--owner`, `--repo`, or `--branch` flags when checking forks or release candidates.

Prefer the GitHub CLI? These commands remain acceptable alternatives:

```bash
gh api repos/:owner/:repo/branches/main/protection --jq '{required_status_checks: .required_status_checks.contexts}'
gh api repos/:owner/:repo/branches/main/protection --jq '.enforce_admins.enabled'
```

- The first command must output the required contexts exactly as listed in the tables above.
- The second must print `true`, proving administrators cannot bypass the checks.
- Record the command output (copy/paste or redirect to a dated text file) for auditors.

### 3. Validate the CI summary gate

1. Open **Actions → ci (v2)** and select the latest successful run on `main`.
2. Verify the `CI summary` job lists every upstream job (core execution, Python analytics, demo rehearsals, policy guard) with matching outcomes, flagging any `SKIPPED (permitted)` entries for forked PRs.
3. Confirm the job is marked as **Required** in the run header. If it is missing, update branch protection immediately and re-run the workflow to refresh the badge.
4. When troubleshooting, re-run the workflow with **Re-run failed jobs** so historical logs remain intact for incident reviews.
5. Download the `ci-summary` artifact and archive `reports/ci/status.md` plus `status.json` with the change ticket; these files
   mirror the on-screen table and prove which jobs were evaluated.【F:.github/workflows/ci.yml†L905-L1010】

### 4. Double-check companion workflows

If your governance policy also requires `e2e`, `fuzz`, `webapp`, or `containers` workflows, repeat the UI and CLI verification to ensure their contexts are enforced. Document any optional workflows in the change ticket associated with the release.

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
