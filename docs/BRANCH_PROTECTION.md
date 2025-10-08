# Branch Protection Policy (AGI Jobs v2)

To keep `main` deployable at all times, enable the following rules in the GitHub repository settings:

1. **Require status checks to pass before merging**
   - `ci (v2) / ci (v2)` (summary job from `.github/workflows/ci.yml`)
   - `contracts`
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

Update CODEOWNERS so that contract, security, and deployment changes always receive the appropriate review before merge. Mirror these requirements onto any release branches you promote (for example, `release/v2`) so that production hotfixes run through the same gates.
