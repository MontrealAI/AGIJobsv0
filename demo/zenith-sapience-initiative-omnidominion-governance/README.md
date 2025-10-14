# Zenith Sapience Initiative — OmniDominion Governance Exemplar

The **OmniDominion Governance Exemplar** is an immersive flagship scenario that proves how the existing AGI Jobs v0 (v2) stack can coordinate a planetary coalition under uncompromising owner control. It packages the smart contracts, orchestrator, thermodynamic incentives, and governance dashboards that already live in this repository into a single, repeatable drill that even non-technical mission staff can execute.

This dossier focuses on three pillars:

1. **Full stack automation** – the existing one-box orchestrator plans, simulates, executes, and settles an entire epoch without human micromanagement.
2. **Owner supremacy with safety interlocks** – every contract parameter, pause circuit, and treasury hook is surfaced with a one-command override so the owner can reshape or halt the economy instantly.
3. **Audit-grade evidence** – the run emits deterministic artefacts (mission control briefings, governance Mermaid diagrams, thermodynamic state, dry-run receipts) that are bundled into a cryptographically hashed kit for downstream regulators or investors.

The scenario is framed as a cross-continental renewable resilience surge, but it is powered purely by the repo’s reusable components: no new Solidity, no new agents, and no speculative APIs. The plan file simply instructs the global demo harness (`scripts/v2/asiGlobalDemo.ts`) to wire the mission together.

## Quick start for non-technical operators

These steps assume nothing beyond a terminal and a cloned repository.

1. **Install dependencies** (one time):
   ```bash
   npm ci
   ```
2. **Run the deterministic demo kit** (generates the governance bundle under `reports/zenith-omnidominion`):
   ```bash
   npm run demo:zenith-sapience-omnidominion
   ```
3. **Optionally rehearse against a local chain** (spawns Hardhat with the same parameters the CI uses):
   ```bash
   npm run demo:zenith-sapience-omnidominion:local
   ```
4. **Review the mission dossier**. The run writes:
   - `reports/zenith-omnidominion/summary.md` – a human-readable KPI digest.
   - `reports/zenith-omnidominion/mission-control.md` – the owner command timeline.
   - `reports/zenith-omnidominion/governance.md` – rendered Mermaid topology for the multisig/timelock stack.
   - `reports/zenith-omnidominion/zenith-omnidominion-kit.json` – manifest with SHA-256 hashes for every artefact.

The CLI prompts and output format mirror the other v2 ASI demos, so operations teams can treat this as another mission stream in their runbook rotation.

## What the demo exercises

- **Mission planning → simulation → execution**: the one-box orchestrator receives the directive, simulates policy checks, posts jobs on the registry, and coordinates agent/validator flows through the existing scripts in `scripts/v2`.
- **Thermodynamic steering**: the plan triggers `scripts/v2/thermodynamicsReport.ts` and `scripts/v2/updateThermodynamics.ts` so stakeholders see exactly which reward shares and temperatures were applied, and how to retune them.
- **Governance visualisation**: Mermaid diagrams, parameter matrices, and owner command centre outputs are produced through the established owner tooling (`npm run owner:command-center`, `npm run owner:parameters`, etc.).
- **Emergency posture**: the plan includes drills that assert `SystemPause` authority, dispute handling, and reward engine overrides without requiring any code changes.
- **CI enforcement**: a dedicated GitHub Actions workflow (`demo-zenith-sapience-omnidominion.yml`) runs the same drill on every PR touching the scenario, keeping the initiative green before it hits `main`.

## Repository integration

- The scenario lives entirely under `demo/zenith-sapience-initiative-omnidominion-governance`, sharing the same schema as other demo packs so downstream tooling (like `scripts/v2/asiGlobalKit.ts`) can consume it transparently.
- The `project-plan.json` file is the single source of truth for stakeholders, defining budgets, participating councils, thermodynamic guardrails, jobs, and reporting outputs.
- Shell wrappers in `bin/` export the environment variables consumed by `demo:asi-global`, meaning no new Node scripts were required.
- Documentation (`README.md`, `RUNBOOK.md`, `OWNER-CONTROL.md`) is designed as operator-facing training material that references existing scripts instead of inventing bespoke commands.

## How this advances CI governance

To satisfy the "fully green V2 CI" requirement, the accompanying workflow pins the new drill into GitHub’s required checks. It locks the scenario behind the same hardening used elsewhere (pinned action SHAs, step-security egress controls) so reviewers can trust the outputs. If the dry-run ever regresses – for example, a reward distribution mismatch or a governance command failure – the job fails, blocking merges until the issue is resolved.

By packaging the scenario this way, the OmniDominion Exemplar demonstrates how a superhuman coordination engine can still be governed, audited, and overridden by its human owners without touching Solidity or agent code.
