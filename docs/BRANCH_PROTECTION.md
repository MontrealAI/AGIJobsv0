# Branch Protection Policy (AGI Jobs v2)

To keep `main` deployable at all times, enable the following rules in the GitHub repository settings:

1. **Require status checks to pass before merging** — type the contexts exactly as they appear in the Checks tab. Group them as shown to keep the list manageable when auditing:

   - **Core execution gate**
     - `ci (v2) / Lint & static checks`
     - `ci (v2) / Tests`
     - `ci (v2) / Foundry`
     - `ci (v2) / Coverage thresholds`
     - `ci (v2) / Invariant tests`
   - **Python intelligence lattice**
     - `ci (v2) / Python unit tests`
     - `ci (v2) / Python integration tests`
     - `ci (v2) / Load-simulation reports`
     - `ci (v2) / Python coverage enforcement`
   - **Governance & readiness demonstrations**
     - `ci (v2) / HGM guardrails`
     - `ci (v2) / Owner control assurance`
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
   - **Policy enforcement & summary**
     - `ci (v2) / Branch protection guard`
     - `ci (v2) / CI summary`
   - **Companion workflows**
     - `e2e / orchestrator-e2e`
     - `fuzz / forge-fuzz`
     - `webapp / webapp-ci`
     - `containers / build`
     - *(Optional, path-filtered)* `apps-images / console` and `apps-images / portal` for Docker image safety when `apps/**` changes.

   After saving the rule, verify the required contexts programmatically:

   ```bash
   gh api repos/:owner/:repo/branches/main/protection --jq '{checks: .required_status_checks.contexts}'
   ```

   The response must list the contexts above in the same order. If the API returns a subset, rerun `npm run ci:verify-branch-protection` to surface the exact delta and restore parity with the workflow job names.

   > **Fork pull requests:** `ci (v2) / Branch protection guard` requires elevated repository permissions. When a forked PR runs the workflow, that job skips automatically and the CI summary labels it as “SKIPPED (permitted)”. Branch protection still enforces the job on `main` and trusted branches.

2. **Require branches to be up to date before merging.**
3. **Require approvals** from CODEOWNERS (minimum 1 reviewer).
4. **Require signed commits** (optional but recommended for provenance).
5. **Restrict force pushes** and disable direct pushes to `main` (require pull requests).
6. **Require linear history** to simplify audit trails.

Update CODEOWNERS so that contract, security, and deployment changes always receive the appropriate review before merge. Mirror these requirements onto any release branches you promote (for example, `release/v2`) so that production hotfixes run through the same gates.
