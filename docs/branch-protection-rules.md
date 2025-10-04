# Branch Protection Rules — AGI Jobs v0 V2

To keep the V2 CI surface green and enforce the governance guarantees specified in the "REDENOMINATION / V2-CI-GREEN" sprint, branch protection on `main` **must** be configured with the following checks and policies:

## Required status checks

Require branches to be up to date before merging and enable the status checks below:

- `contracts` (matrix of Node.js 18 & 20)
- `security`
- `fuzz`
- `e2e`
- `webapp`
- `containers`
- `release` (release workflow will only run on tags / manual dispatch, but it must remain green when invoked)

These status checks cover the compilation matrix, coverage gates, ABI drift guard, security scanners, Foundry fuzzing, end-to-end orchestration suites, Cypress front-end coverage, container supply-chain scanning, and release provenance.

## Pull request requirements

- Require pull request reviews before merging (at least one approving review).
- Enforce CODEOWNERS review requirements.
- Dismiss stale approvals when new commits are pushed.
- Require conversation resolution before merging.

## Push restrictions

- Block direct pushes to `main`; only merges via protected pull requests are allowed.
- Restrict who can force push or delete the branch (ideally no one except repository administrators for break-glass scenarios).

Keeping these protections in place ensures that every change to `main` has passed the full V2 CI/CD stack, providing confidence for institutional operators running AGI Jobs on Ethereum mainnet.
