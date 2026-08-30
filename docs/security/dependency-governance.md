# Dependency Governance & Production Audit Policy

This runbook codifies the “no surprises” dependency posture recommended for
institutional launch. It locks our build toolchain, enforces high/critical
vulnerability gating for production dependencies, and documents the owner playbook
for responding to upstream security events.

## 1. Locked toolchains for deterministic builds

- **Node.js:** The repository root `.nvmrc` pins Node.js to `20.18.1`. All CI jobs
  and release automation consume this file via `actions/setup-node`, ensuring
  byte-for-byte reproducible npm installs.
- **Foundry:** `foundry.toml` already locks `forge_version = "1.4.0"` and
  `solc_version = "0.8.25"`. Operators should update these only through a PR that
  reruns the full CI matrix.
- **Docker builds:** Container workflows embed `provenance: mode=max` and Cosign
  signing to bind images to the git commit hash.

When upgrading any toolchain, update the pinned version **and** record the change
in `CHANGELOG.md` so downstream auditors can rehydrate the exact environment.

## 2. Security audit policy (`npm run security:audit`)

The CI-enforced audit now runs `audit-ci` with:

- `--high --critical` – fail the pipeline on any high or critical advisory.
- `--skip-dev` – ignore development-only packages so tooling CVEs (e.g. Hardhat
  helpers) cannot block deploys while still being tracked in dependency reports.
- `audit-ci.json` allow-list contains only advisories verified as false positives
  or mitigated operationally.

This combination guarantees that production artifacts never ship with known high
severity vulnerabilities. Development advisories remain visible in local reports
but do not gate production so long as they stay outside runtime bundles.

### Owner checklist when the audit fails

1. **Inspect the advisory**: run `npm run security:audit -- --report` locally to
   view the full advisory metadata.
2. **Determine exposure**: confirm whether the dependency is bundled in
   production artifacts (contracts, Docker images, or Node services). If yes,
   treat as a P0 incident and execute the emergency patch process.
3. **Patch or replace**: upgrade the package or swap it for a maintained
   alternative. Document the fix in the PR description and `CHANGELOG.md`.
4. **Tag the release**: rerun CI, ensure the audit passes, then publish the signed
   release bundle so downstream operators can validate the remediation.

## 3. Quarantining dev-only advisories

To keep development advisories from leaking into runtime builds:

- `audit-ci` runs with `--skip-dev` inside CI, ensuring the enforced audit surface
  matches what lands in production images.
- Dockerfiles use multi-stage builds that copy compiled artifacts rather than the
  full workspace, preventing transitive dev tools from entering runtime layers.
- The owner dashboard (`npm run owner:dashboard`) lists active advisories from the
  latest CI run so governance can decide whether to patch or accept the risk.

## 4. Continuous monitoring & reporting

- **Weekly review**: schedule a standing task to run `npm audit --production`
  locally. Compare results against the latest SBOM in `reports/sbom` to detect
  drifts.
- **Release attachments**: each tagged release must include the SBOM,
  Cosign signatures, and build provenance already produced by `release.yml`.
- **Incident response tie-in**: if a critical advisory lands in production,
  execute the incident response guide in `docs/owner-control-emergency-runbook.md`
  to pause the protocol until the patched release is deployed.

By following this playbook the contract owner maintains complete control over
runtime dependencies, satisfies institutional due diligence requirements, and
retains the ability to freeze, patch, and redeploy the system in minutes.
