# Institutional Readiness Status (AGI Jobs v0/v2)

This status dossier records how the repository satisfies the "Institutional Deployment Readiness" punch-list. Each control below cross-references the precise artefacts, workflows, or automation that enforce the requirement so security reviewers and release managers can audit compliance without hunting across the tree.

## Release governance
- **Signed tags & provenance.** Release automation enforces signed tags (`scripts/ci/ensure-tag-signature.js`) and publishes SBOM + manifest bundles via `.github/workflows/release.yml`.
- **Explorer transparency.** `npm run release:verify` (wired through the release workflow) performs automated Etherscan/Blockscout verification with OIDC-backed credentials, as described in `docs/release-explorer-verification.md`.
- **Artifact attestation.** `docs/release-signing.md` & `docs/release-artifacts.md` capture the Cosign/SLSA procedure and the reporting inputs emitted by CI.

## CI & supply-chain hardening
- **Green-only merges.** Branch policy expectations are codified in `docs/ci-v2-branch-protection-checklist.md`; reviewers can run `npm run ci:verify-branch-protection` locally to confirm GitHub settings until the script is wired into CI.
- **Pinned GitHub Actions + hardened runners.** All workflows (see `.github/workflows/*.yml`) pin Actions to SHAs and start with `step-security/harden-runner` to restrict egress.
- **Static analysis + SARIF uploads.** `.github/workflows/static-analysis.yml` runs Slither, validates an allowlist, and uploads SARIF results to GitHub code scanning.
- **Toolchain immutability.** `docs/toolchain-locks.md` documents pinned versions; `.nvmrc`, `foundry.toml`, and `scripts/ci/check-toolchain-locks.js` enforce the same versions during automation.

## Runtime safety & monitoring
- **Owner controls & pausability.** Owner command centre tooling (`scripts/v2/ownerControl*.ts`) and the documentation suite under `docs/owner-control-*` guarantee the deployer can modify, pause, or upgrade all parameters.
- **Invariant guardrails for control drift.** The Foundry invariant harness in `test/v2/invariant/SystemPauseControlInvariant.t.sol` fuzzes governance operations to prove that pauser delegation, ownership, and mass pause semantics never drift away from the SystemPause owner, even under adversarial call sequences.
- **On-chain sentinels.** Templates in `monitoring/onchain/*.json` render via `npm run monitoring:sentinels`; validation guardrails run in CI (`npm run monitoring:validate`).
- **Forta/Defender integration.** Operational playbooks (`docs/monitoring-onchain.md`, `docs/security/forta-calibration.md`) and incident tabletop scripts (`npm run incident:tabletop`) bind Forta alerts to the incident process.

## Incident response & operations
- **Documented IR plan.** `docs/incident-response.md` defines severity levels, communication trees, and break-glass sequences; `docs/security/incident-tabletop.md` provides the rehearsal checklist.
- **Tabletop cadence.** CI exposes `npm run incident:tabletop -- --list` to ensure drills remain auditable (see `docs/security/incident-response-scenarios.json`).
- **Owner runbooks for non-technical operators.** The owner handbook suite (for example, `docs/owner-control-handbook.md`, `docs/owner-control-command-center.md`) and `npm run owner:quickstart` cover zero-code operations end-to-end.

## Deployment transparency
- **Release manifest & SBOM.** `npm run release:manifest`, `npm run release:manifest:validate -- --fail-on-warnings --require-addresses`, `npm run release:notes`, and `npm run sbom:generate` produce the artefacts enumerated in `docs/release-artifacts.md` with validation that fails if metadata or addresses drift.
- **Contract address registry.** `docs/DEPLOYED_ADDRESSES.md` and machine-readable JSON snapshots (`docs/deployment-addresses.json`) stay in sync via the deployment guides.
- **Operator telemetry.** `monitoring/` houses Prometheus/Grafana/Alertmanager configs, with the high-level orientation in `docs/operator-telemetry.md` and `docs/institutional-observability.md`.

## Verification steps for reviewers
1. Run `npm ci`, `npm run lint:ci`, and `npm test` to reproduce the primary CI gates locally.
2. Execute `npm run monitoring:validate` and `npm run incident:tabletop -- --list` to confirm the monitoring and IR scaffolding render cleanly.
3. Inspect `.github/workflows/release.yml` outputs (`reports/release/manifest.json`, `reports/sbom/cyclonedx.json`) and the Forta/Defender rendered JSON under `monitoring/onchain/rendered/` to prove artefact completeness.
4. Validate owner superpowers with `npm run owner:command-center` and compare against the documented controls in `docs/owner-control-index.md`.

Maintaining this status file:
- Update the references above if artefact locations move or additional controls are added.
- Record any exceptions or temporary deviations alongside remediation dates so auditors have a canonical view of posture.
