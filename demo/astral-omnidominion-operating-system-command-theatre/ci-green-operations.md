# CI Green Operations Manual

Maintaining a permanently green CI v2 surface is essential for the Astral Omnidominion theatre. This manual maps the demonstration flow to the enforced GitHub Actions checks and documents the verification commands available to repository maintainers.

## 1. Required GitHub Actions checks

The CI v2 policy requires the following workflows to succeed before merging into `main` and for branch protection:

| Workflow | Description |
| --- | --- |
| `CI / lint` | Solhint + ESLint without warnings. |
| `CI / tests` | Hardhat unit tests. |
| `CI / foundry` | Foundry fuzz tests (`forge test`) with deterministic seed. |
| `CI / coverage` | Coverage threshold validation (≥ 90% overall, access-control coverage). |
| `CI / summary` | Aggregated pass/fail indicator gating merges. |
| `CI / webapp` (companion) | Builds the owner/console webapp. |
| `CI / e2e` (companion) | Cypress end-to-end suite against the console preview. |
| `CI / fuzz` (companion) | Extended Foundry fuzzing. |
| `CI / container-scan` | OWASP/Trivy container scan for published images. |

Mark each workflow as “Required” in GitHub branch protection. Use the `ci:verify-branch-protection` script to confirm settings:

```bash
npm run ci:verify-branch-protection
```

The script fails if any expected check is missing, ensuring visibility of all gates on PRs and the default branch.

## 2. Local parity commands

Mirror the CI stages locally before pushing:

```bash
npm run lint:ci
npm test
npm run coverage
npm run check:coverage
npm run check:access-control
npm run webapp:build
npm run webapp:typecheck
npm run webapp:e2e   # requires running preview server
```

For fuzzing parity:

```bash
FOUNDRY_PROFILE=ci forge test
```

These commands are already invoked indirectly during `npm run demo:agi-os:first-class` via the embedded `demo:agi-os` stage (compilation, deterministic simulation, owner verification). Running them separately pre-validates commits before CI.

## 3. One-click stack health

The one-click deploy wizard shares its steps with CI (contract compilation, configuration validation). Keep the stack healthy by:

- Re-generating `.env` via `npm run deploy:env` when credentials rotate.
- Ensuring Docker images are rebuilt after dependency updates (`docker compose build`).
- Monitoring Compose healthchecks (`docker compose ps`) to confirm services are ready before running UI end-to-end tests.

## 4. Incident response when CI fails

1. **Identify failing job** — Inspect the failing workflow log via GitHub.
2. **Replicate locally** using the commands in section 2.
3. **Fix and document** — Update code or configuration; note remediation steps in the PR description.
4. **Re-run theatre** — Execute `npm run demo:agi-os:first-class -- --skip-deploy` to ensure the mission bundle remains green with the new changes.
5. **Re-request review** — Attach log excerpts or updated artefacts demonstrating the fix.

Maintaining this feedback loop keeps the theatre—and the broader AGI Jobs v0 (v2) platform—production ready.
