# Branch Protection Policy (AGI Jobs v2)

Branch protection ties together the modular CI lattice introduced in `ci / lint lattice`, `ci / test lattice`, and `ci / analytics lattice`. Each workflow publishes jobs that mirror the live status wall so the GitHub Checks UI exactly matches the enforcement manifest. Enable the following rules in the repository settings to keep `main` deployable at all times and to make sure every modular workflow remains a required gate:

1. **Require status checks to pass before merging** — type the contexts exactly as they appear in the Checks tab. Group them as shown to keep the list manageable when auditing:

   - **Lint lattice (`ci / lint lattice`)**
     - `ci / lint lattice / Lint & static checks`
     - `ci / lint lattice / HGM guardrails`
     - `ci / lint lattice / Owner control assurance`
     - `ci / lint lattice / Branch protection guard`
     - `ci / lint lattice / CI summary`
   - **Core execution gate (`ci / test lattice`)**
     - `ci / test lattice / Tests`
     - `ci / test lattice / Foundry`
     - `ci / test lattice / Coverage thresholds`
     - `ci / test lattice / Invariant tests`
     - `ci / test lattice / CI summary`
   - **Python intelligence lattice (`ci / analytics lattice`)**
     - `ci / analytics lattice / Python unit tests`
     - `ci / analytics lattice / Python integration tests`
     - `ci / analytics lattice / Load-simulation reports`
     - `ci / analytics lattice / Python coverage enforcement`
     - `ci / analytics lattice / CI summary`
   - **Governance & readiness demonstrations (legacy `ci (v2)` workflow)**
     - `ci (v2) / Phase 6 readiness`
     - `ci (v2) / Phase 8 readiness`
     - `ci (v2) / Kardashev II readiness`
     - `ci (v2) / ASI Take-Off Demonstration`
     - `ci (v2) / Zenith Sapience Demonstration`
     - `ci (v2) / Celestial Archon Demonstration`
     - `ci (v2) / Hypernova Governance Demonstration`
     - `ci (v2) / AGI Labor Market Grand Demo`
     - `ci (v2) / Sovereign Mesh Demo — build`
     - `ci (v2) / Sovereign Constellation Demo — build`
   - **Companion workflows**
     - `e2e / orchestrator-e2e`
     - `fuzz / forge-fuzz`
     - `webapp / webapp-ci`
     - `containers / build (node-runner)`
     - `containers / build (validator-runner)`
     - `containers / build (gateway)`
     - `containers / build (webapp)`
     - `containers / build (owner-console)`
   - *(Optional, path-filtered)* `apps-images / console` and `apps-images / portal` for Docker image safety when `apps/**` changes.

   The modular workflows emit new status contexts without removing the legacy `ci (v2)` equivalents. Until the monolithic workflow is retired, keep both sets in the rule so that branch protection blocks merges regardless of which lattice a contributor inspects.

   After saving the rule, verify the required contexts programmatically. The fastest option is to run the repository scripts that parse `.github/workflows/ci.yml` and compare it with the live rule:

   ```bash
   npm run ci:verify-contexts
   npm run ci:verify-companion-contexts
   npm run ci:verify-branch-protection -- --branch main
   ```

   Each command prints a ✅/❌ table and exits non-zero if drift is detected, making them ideal for change tickets and runbooks.【F:scripts/ci/check-ci-required-contexts.ts†L1-L117】【F:scripts/ci/check-ci-companion-contexts.ts†L1-L74】【F:scripts/ci/verify-branch-protection.ts†L1-L220】 If you prefer raw API output, `gh api repos/:owner/:repo/branches/main/protection --jq '{checks: .required_status_checks.contexts}'` must list the contexts above in the same order. Any mismatch means the rule needs to be updated immediately.

   > **Fork pull requests:** The modular lint lattice keeps the existing skip semantics—`ci / lint lattice / Branch protection guard` requires elevated permissions. When a forked PR runs the workflow, that job skips automatically and the lint lattice summary labels it as “SKIPPED (permitted)”. Branch protection still enforces the job on `main` and trusted branches.

2. **Require branches to be up to date before merging.**
3. **Require approvals** from CODEOWNERS (minimum 1 reviewer).
4. **Require signed commits** (optional but recommended for provenance).
5. **Restrict force pushes** and disable direct pushes to `main` (require pull requests).
6. **Require linear history** to simplify audit trails.

Update CODEOWNERS so that contract, security, and deployment changes always receive the appropriate review before merge. Mirror these requirements onto any release branches you promote (for example, `release/v2`) so that production hotfixes run through the same gates.
