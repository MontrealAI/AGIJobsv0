# CI Guardrails – Planetary Orchestrator Fabric v0

This demo ships with a dedicated CI workflow to guarantee that every pull request and `main` commit keeps the planetary fabric runnable, verifiable, and regression-free.

## Workflow Summary

- **Location:** `.github/workflows/demo-planetary-orchestrator-fabric.yml`
- **Triggers:**
  - Any change beneath `demo/Planetary-Orchestrator-Fabric-v0/**`
  - Dependency updates (`package.json`, `package-lock.json`)
  - Manual runs via `workflow_dispatch`
- **Environment:** Hardened Ubuntu 24.04 runner with outbound network locked to GitHub + npm registries.

## Job Stages

1. **Checkout & Hardening** – Uses `step-security/harden-runner` to freeze outbound egress except the allowlist.
2. **Dependency Sync** – `npm ci` ensures deterministic dependency graphs.
3. **Type Safety** – `npx tsc --noEmit` validates the demo sources compile without generating JS.
4. **Unit Tests** – `npm run test:planetary-orchestrator-fabric` executes deterministic simulations verifying shard balance, node failover (<2% drop), and checkpoint resume.
5. **Demo Execution** – `npm run demo:planetary-orchestrator-fabric:ci` runs the fabric end-to-end in CI mode, producing reports under `reports/ci-latest`.
6. **Artifact Validation** – Node scripts ensure `summary.json`, `events.ndjson`, `dashboard.html`, and `owner-script.json` exist and contain required sections.

## Branch Protection

Add the following required status checks to the repository settings:

- `demo-planetary-orchestrator-fabric`

With this in place, no pull request touching the demo can merge without a green, reproducible run.

## Local Verification

Run the same steps locally:

```bash
npm ci --no-audit --prefer-offline --progress=false
npx tsc --noEmit --project demo/Planetary-Orchestrator-Fabric-v0/tsconfig.json
npm run test:planetary-orchestrator-fabric
npm run demo:planetary-orchestrator-fabric:ci
```

## Deliverables Captured by CI

| File | Purpose |
| --- | --- |
| `reports/ci-latest/summary.json` | Throughput, recovery, deterministic seeds |
| `reports/ci-latest/events.ndjson` | Event-by-event telemetry |
| `reports/ci-latest/dashboard.html` | Rendered mission control dashboard |
| `reports/ci-latest/owner-script.json` | Replayable owner command payloads |
| `storage/checkpoint.json` | Most recent checkpoint snapshot |

These guardrails keep the demo production-ready and prove that AGI Jobs v0 (v2) can enforce enterprise-grade CI discipline for planetary orchestration.
