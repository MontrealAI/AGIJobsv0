# Assurance Matrix

The Omega Omni Operating System inherits the repository's "CI v2" discipline. This matrix maps operational goals to the specific checks, artefacts, and workflows that keep the demo production-ready.

## Continuous Integration Lattice

| CI Goal | Workflow Step | Command | Artefact / Evidence |
| --- | --- | --- | --- |
| Enforce linting and static analysis | `.github/workflows/ci.yml` → `lint` job | `npm run lint:ci` | CLI output confirming ESLint + Solhint success. |
| Guarantee unit coverage | `.github/workflows/ci.yml` → `coverage` job | `npm run coverage:check` | Console log emitted by `scripts/check-coverage.js`. |
| Exercise Foundry fuzzing | `.github/workflows/ci.yml` → `foundry` job | `forge test` | Forge summary verifying reward/stake invariants. |
| Validate branch protections | `.github/workflows/ci.yml` → `ci-verify` job | `npm run ci:verify-branch-protection` | JSON diff of GitHub required checks to policy baseline. |
| Confirm access-control coverage | `.github/workflows/ci.yml` → `access-control` job | `npm run check:access-control` | Output from `scripts/ci/check-access-control-coverage.js`. |
| Run demo smoke tests | `.github/workflows/ci.yml` → `demo-zenith`, `demo-asi-takeoff` jobs | `npm run demo:zenith-sapience-initiative:local`, `npm run demo:asi-takeoff:local` | Deterministic aurora reports published as CI artefacts. |
| Probe observability | `.github/workflows/ci.yml` → `observability` job | `npm run observability:smoke` | CLI output validating metrics + notification wiring. |

All jobs are marked as required in GitHub branch protection; a failing check blocks merges to `main`.

## Operator Verifications

| Objective | Command | Expected Result |
| --- | --- | --- |
| Baseline control surface | `npm run owner:surface -- --network <network>` | Markdown summarising on-chain owner modules. |
| Snapshot owner health | `npm run owner:doctor -- --network <network> --json` | JSON health report flagging any misconfiguration. |
| Render governance topology | `npm run owner:diagram -- --network <network> --out runtime/governance.mmd` | Mermaid diagram of owners, proxies, and pause switches. |
| Reconcile thermodynamics | `npm run thermodynamics:report -- --network <network>` | Detailed PID telemetry diff for thermostat settings. |
| Validate ENS + identity | `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/auditIdentityRegistry.ts --network <network>` | Report confirming registry entries and attestation proofs. |
| Smoke-test notifications | `npm run monitoring:validate` | CLI output verifying sentinel definitions. |

These verifications complement CI by giving stewards real-time confirmation that deployed contracts and automations match the manifests.

## Artefact Retention

1. **Reports** – Copy generated markdown, JSON, and Mermaid files into `runtime/` for each run.
2. **Checksums** – Hash bundles with `shasum -a 256` and store alongside governance tickets.
3. **CI Attachments** – Download aurora/demo artefacts from the GitHub Actions run and archive them with the change record.
4. **Run Logs** – Preserve console logs for commands such as `owner:update-all -- --execute` and `updateSystemPause.ts` to prove operator intent.

Maintaining this evidence base creates an audit-grade trail that satisfies regulators, partners, and incident responders alike.
