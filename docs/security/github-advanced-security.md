# GitHub Advanced Security Enforcement Playbook

> **Audience:** Repository owners and security captains who must prove that secret scanning, push protection, and ecosystem integrations
> are permanently enforced for AGI Jobs v0 (v2).
>
> **Goal:** Provide a reproducible checklist for enabling and auditing GitHub Advanced Security (GHAS) features that institutional reviewers
> now expect for production contracts, including secret scanning, push protection, and Scorecard surfacing.

---

## 1. Enable mandatory secret scanning

1. Navigate to **Settings → Code security and analysis**.
2. Under **Secret scanning**, activate **GitHub Advanced Security**, **Secret scanning**, and **Push protection** for the repository.
3. Repeat the same toggles at the organization level so forks inherit the safeguards.
4. Capture a screenshot or export the settings via `gh api` and store it with your release change ticket.

### Command-line verification

```bash
# Returns `true` when secret scanning and push protection are both enabled
gh api repos/:owner/:repo/code-scanning/alerts --paginate --jq 'true' >/dev/null

gh api repos/:owner/:repo --jq '.security_and_analysis.secret_scanning.status'
# => "enabled"

gh api repos/:owner/:repo --jq '.security_and_analysis.secret_scanning_push_protection.status'
# => "enabled"
```

Record the JSON output alongside the branch-protection audit so the compliance vault has a single reference.

---

## 2. Guard PRs with CodeQL and Slither

The `static-analysis` workflow now uploads SARIF reports from Slither and CodeQL on every pull request and push to `main`.
Mark both contexts as **Required** in branch protection so red findings block merges.【F:.github/workflows/static-analysis.yml†L20-L157】
When auditors review the GitHub Security tab they should see:

- A Slither scan per PR with the policy gate run by `tools/security/validate-slither.mjs`.
- A CodeQL JavaScript/TypeScript scan referencing `.github/codeql/config.yml` and the hardened configuration.【F:.github/codeql/config.yml†L1-L27】

Export the SARIF results as part of the release evidence bundle by downloading the workflow artifacts.

---

## 3. Maintain OpenSSF Scorecard evidence

The `security-scorecard` workflow executes weekly and on every push to `main`, uploads the SARIF report, and publishes
telemetry to the OpenSSF dashboard.【F:.github/workflows/scorecard.yml†L1-L52】 Use the following steps to keep the score ≥8.5:

1. Confirm `ossf-scorecard-report` appears in the workflow run artifacts.
2. Verify the GitHub Security tab shows the Scorecard SARIF without warnings.【F:.github/workflows/scorecard.yml†L53-L66】
3. Store the report in your release archive so downstream partners can independently review supply-chain posture.

If the score drops, inspect the workflow summary for failing checks (e.g., branch protection drift or dependency pinning) and remediate before approving merges.

---

## 4. Release sign-off checklist

Before approving a production deploy or tagging a release:

- ✅ Branch protection audit stored, including the seven required CI and static-analysis contexts.【F:docs/ci-v2-branch-protection-checklist.md†L12-L60】
- ✅ Secret scanning and push protection outputs captured via the commands above.
- ✅ Latest Scorecard SARIF archived with the release manifest.
- ✅ Owners confirmed that CodeQL and Slither SARIF results show **no open alerts** or documented mitigations.

Maintaining these artifacts closes the remaining institutional-readiness gap for GitHub governance and satisfies the
risk committees that review AGI Jobs v0 (v2) deployments.
