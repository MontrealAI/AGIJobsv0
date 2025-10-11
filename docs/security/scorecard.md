# OpenSSF Scorecard Enforcement

The security-scorecard workflow (`.github/workflows/scorecard.yml`) runs on every
pull request, on pushes to `main`, and weekly on Mondays at 03:45 UTC. It
executes two passes of the OpenSSF Scorecard scanner:

1. **JSON run (publish + policy):** Uploads the latest metrics to
   [scorecard.dev](https://scorecard.dev/viewer/?uri=github.com/MontrealAI/AGIJobsv0)
   using GitHub OIDC credentials and writes the raw JSON report to
   `reports/security/scorecard.json`.
2. **SARIF run (code scanning):** Produces `reports/security/scorecard.sarif`
   so the repository's Security tab surfaces Scorecard findings alongside
   CodeQL and Slither results.

The JSON output is fed to `tools/security/validate-scorecard.mjs`, which hard
fails the workflow if any of the following conditions regress:

| Check | Minimum score |
| --- | --- |
| Binary-Artifacts | 8 |
| Code-Review | 8 |
| Maintained | 8 |
| Signed-Releases | 8 |
| Token-Permissions | 7 |
| Vulnerabilities | 7 |
| Dependency-Update-Tool | 7 |
| Security-Policy | 7 |
| Overall repository score | 8 |

A failing check surfaces in the workflow logs and in the GitHub job summary so
contributors can remediate issues before merging.

## Local verification

To mirror the CI gate locally:

```bash
npm install
mkdir -p reports/security
npx scorecard --repo=github.com/MontrealAI/AGIJobsv0 --format=json > reports/security/scorecard.json
npm run security:scorecard:check
```

If you lack the native Scorecard binary, the official container image works as
well:

```bash
docker run --rm ghcr.io/ossf/scorecard:stable \
  --repo=github.com/MontrealAI/AGIJobsv0 \
  --commit=$(git rev-parse HEAD) \
  --format=json > reports/security/scorecard.json
npm run security:scorecard:check
```

## Operational guidance

- Attach the generated JSON and SARIF artefacts to any compliance evidence
  bundle so risk reviewers can confirm the repository meets the enforced
  thresholds.
- If the workflow fails on a non-default branch because the checks cannot be
  computed (e.g., missing release tags during feature development), regenerate
  the report from `main`, archive it under `reports/security/scorecard.json`,
  and rerun the job to demonstrate compliance while you address the root cause.
- The Scorecard badge is automatically updated by the workflow. If the public
  badge ever drops below the thresholds above, block releases until the issues
  are resolved and a passing run is recorded.
