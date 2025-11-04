# AGI Jobs v0 (v2) — .github → Signers

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `.github/signers`.

## Overview
- **Path:** `.github/signers/README.md`
- **Module Focus:** Anchors .github → Signers inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `.github/signers` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> _github_signers[[.github → Signers]]
    _github_signers --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. From the repository root run `npm install` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `.github/signers`.
3. Execute `npm test` and `npm run lint --if-present` before pushing to guarantee a fully green AGI Jobs v0 (v2) CI signal.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../OperatorRunbook.md).

## Directory Guide
### Key Files
- `allowed_signers` — production guardian registry consumed by release workflows and `git tag -v`.

| Principal | Key type | Notes |
| --- | --- | --- |
| `maintainer1@example.com` | `ssh-ed25519` | Sample hardware-ready entry; replace with a live guardian key before shipping. |
| `maintainer2@example.com` | `sk-ssh-ed25519@openssh.com` | Demonstrates security-key namespaces for biometric-protected signers. |
| `maintainer3@example.com` | `ssh-ed25519` + `valid-before` | Shows how to stage expiring emergency keys for high-velocity launches. |

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Run `npm run ci:verify-signers` after modifying the registry; CI enforces namespace scopes and base64 validity so only authentic guardians can sign releases.【F:package.json†L137-L143】【F:scripts/ci/check-signers.js†L1-L120】
- Capture the updated hardware fingerprints inside your governance vault and update multisig playbooks accordingly.
- Link new deliverables back to the central manifest via `npm run release:manifest` so provenance stays synchronised with mission telemetry.
