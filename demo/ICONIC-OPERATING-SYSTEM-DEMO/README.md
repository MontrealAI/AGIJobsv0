# AGI Jobs v0 (v2) – First-Class Operating System Demonstration

## Purpose

This guide packages the existing `demo:agi-os` pipeline into a single reference that a non-technical operator can follow end-to-end. It leans entirely on the repository's battle-tested scripts and infrastructure so that no new smart-contract, agent, or UI logic needs to be introduced. The outcome is a reproducible "mission bundle" under `reports/agi-os/` which captures the full ASI take-off rehearsal, owner control audit, and executive summary artifacts produced by the AGI Jobs v0 (v2) stack.

## High-Level Flow

1. Launch the one-click Docker environment that ships with the repository. This boots a local blockchain, orchestrator, web front-ends, and supporting services in isolated containers.
2. Run the existing `npm run demo:agi-os` pipeline inside the container host. The script compiles contracts, executes the deterministic labor-market simulation, synthesizes the owner authority matrix, and assembles audit-grade bundles under `reports/agi-os/`.
3. Review the generated artifacts – especially `grand-summary.md` for executives and the JSON manifest for auditors – to confirm the platform is production-ready.

## Step-by-Step Checklist

### 1. Prerequisites

- Docker Engine 24+ with Compose plugin installed
- Node.js 18+ (only required if you prefer executing NPM scripts directly on the host instead of through Docker)
- At least 8 GB of free RAM and 15 GB of disk space for container images and reports

### 2. Start the One-Click Stack

From the repository root:

```bash
npm run deploy:oneclick:auto -- --network localhost --compose
```

This mirrors the documented "one-click" bootstrap, spinning up the full AGI Jobs environment with secure defaults (all modules paused until the owner resumes them) on a local Anvil chain while automatically starting the Docker Compose stack.

### 3. Run the Grand Demo Pipeline

With the stack online, execute:

```bash
npm run demo:agi-os
```

The script orchestrates the ASI take-off simulation and packages the mission bundle. Expect the run to take several minutes.

### 4. Inspect the Mission Bundle

Upon completion, review the generated assets:

- `reports/agi-os/grand-summary.md`: executive overview of the mission, simulation outcomes, and owner authority matrix.
- `reports/agi-os/grand-summary.json`: machine-readable mirror for dashboards and automation.
- `reports/agi-os/manifest.json`: SHA-256 hashes of every artifact for audit verification.

### 5. Optional User Interfaces

If you started the stack with Docker, the following front-ends become available automatically:

- **Owner Console** (`http://localhost:3000`): visualize governance status, pause/unpause modules, and submit owner updates.
- **Enterprise Portal** (`http://localhost:3001`): conversational job creation with "Submit Job" workflow, demonstrating push-button AGI coordination.
- **Validator Dashboard** (`http://localhost:3002`): monitor and action validator workloads for the simulated jobs.

### 6. Clean Up

When finished, tear down the stack and reclaim disk space:

```bash
docker compose down --remove-orphans
```

This stops and removes the containers while preserving mission bundles for future review.

## Troubleshooting & Notes

- The demo intentionally reuses the same compilation, testing, and verification steps enforced by CI v2. A green demo run therefore mirrors a green CI run.
- If `npm run demo:agi-os` fails, rerun it after executing `npm install` to ensure dependencies are up to date.
- To regenerate the bundle without Docker (for example in CI), run `npm run demo:agi-os` directly on a machine with Node.js 18+ and Hardhat prerequisites installed.

