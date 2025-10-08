# Branch Protection Policy (AGI Jobs v2)

To keep `main` deployable at all times, enable the following rules in the GitHub repository settings:

1. **Require status checks to pass before merging** — type the contexts exactly as they appear in the Checks tab:
   - `ci (v2) / Lint & static checks`
   - `ci (v2) / Tests`
   - `ci (v2) / Foundry`
   - `ci (v2) / Coverage thresholds`
   - `ci (v2) / CI summary`
   - `e2e / orchestrator-e2e`
   - `fuzz / forge-fuzz`
   - `webapp / webapp-ci`
   - `containers / build`
   - *(Optional, path-filtered)* `apps-images / console` and `apps-images / portal` for Docker image safety when `apps/**` changes.
   After saving the rule, verify the required contexts programmatically:

   ```bash
   gh api repos/:owner/:repo/branches/main/protection --jq '{checks: .required_status_checks.contexts}'
   ```

   The response must list the contexts above in the same order.

2. **Require branches to be up to date before merging.**
3. **Require approvals** from CODEOWNERS (minimum 1 reviewer).
4. **Require signed commits** (optional but recommended for provenance).
5. **Restrict force pushes** and disable direct pushes to `main` (require pull requests).
6. **Require linear history** to simplify audit trails.

Update CODEOWNERS so that contract, security, and deployment changes always receive the appropriate review before merge. Mirror these requirements onto any release branches you promote (for example, `release/v2`) so that production hotfixes run through the same gates.
