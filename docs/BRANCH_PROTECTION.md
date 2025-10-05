# Branch Protection Policy (AGI Jobs v2)

To keep `main` deployable at all times, enable the following rules in the GitHub repository settings:

1. **Require status checks to pass before merging**
   - `contracts`
   - `orchestrator`
   - `security`
   - `fuzz`
   - `e2e`
   - `webapp`
   - `containers`
   - `release` (for tagged builds)
2. **Require branches to be up to date before merging.**
3. **Require approvals** from CODEOWNERS (minimum 1 reviewer).
4. **Require signed commits** (optional but recommended for provenance).
5. **Restrict force pushes** and disable direct pushes to `main` (require pull requests).
6. **Require linear history** to simplify audit trails.

Use the [V2 CI Green Path](ci/v2-green-path.md) guide to reproduce any failing workflow locally before approving merges. Update CODEOWNERS so that contract, security, and deployment changes always receive the appropriate review before merge.
