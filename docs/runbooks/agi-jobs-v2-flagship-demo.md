# AGI Jobs v0 (v2) Flagship Demo Runbook

## Purpose

This runbook packages the "AGI Jobs v0 (v2) Flagship Demo" into a repeatable
playbook that a non-technical operator can execute. It relies exclusively on
artifacts that already live in this repository – primarily the
`demo/cosmic-omni-sovereign-symphony` package – and demonstrates how to deliver a
full operating-system rehearsal that spans multinational governance, labour
market automation, owner control validation, and observability outputs.

## Components

| Domain | Location | Notes |
| --- | --- | --- |
| Governance orchestration | `demo/cosmic-omni-sovereign-symphony/bin/orchestrate.sh` | Deploys `GlobalGovernanceCouncil`, seeds nations, exercises pause/unpause, exports ledger, and builds knowledge graph payloads. |
| Flagship coordinator | `demo/cosmic-omni-sovereign-symphony/bin/flagship-demo.sh` | Wraps the governance orchestration with the AGI OS mission simulation and owner parameter matrix capture. |
| Mission simulation | `scripts/v2/agiOperatingSystemDemo.ts` (via `npm run demo:agi-os`) | Replays the operating system workflow with job publication, validator commit/reveal, and report assembly. |
| Owner control audit | `scripts/v2/ownerParameterMatrix.ts` (via `npm run owner:parameters`) | Extracts the live adjustable parameter set to verify full owner control surfaces. |
| Dashboards & diagrams | `demo/cosmic-omni-sovereign-symphony/dashboards` & `demo/cosmic-omni-sovereign-symphony/docs` | Provide Grafana JSON and Mermaid diagrams for stakeholder briefings. |

## Pre-flight Checklist

1. **Node.js toolchain** – Install the Node version pinned in `.nvmrc` (currently
   `20.18.1`).
2. **Environment template** – Copy the packaged `.env` template and adjust RPC
   endpoints or private keys when broadcasting is desired:
   ```bash
   cp demo/cosmic-omni-sovereign-symphony/config/.env.example demo/cosmic-omni-sovereign-symphony/.env
   ```
3. **Dry-run safety** – Leave `AGIJOBS_DEMO_DRY_RUN=true` (default) for local
   rehearsals. Mainnet transactions require explicit confirmation flags inside
   the orchestrator scripts.

## Execution Flow (Non-technical Operator)

1. **Launch the flagship coordinator** from the repository root:
   ```bash
   demo/cosmic-omni-sovereign-symphony/bin/flagship-demo.sh --dry-run
   ```
   - Runs `npm ci` to reproduce the CI toolchain.
   - Calls `bin/orchestrate.sh` to deploy and exercise the multinational
     governance scenario on a local Hardhat node.
   - Executes `npm run demo:agi-os` to replay the AGI operating system
     simulation covering employer, agent, and validator actors.
   - Executes `npm run owner:parameters` to dump the owner-controlled parameter
     matrix.
   - Optionally renders `docs/architecture.mmd` to SVG when the Mermaid CLI is
     available.
2. **Inspect artefacts** once the script reports completion:
   - `demo/cosmic-omni-sovereign-symphony/logs/ledger-latest.json` – On-chain
     governance ledger snapshot.
   - `demo/cosmic-omni-sovereign-symphony/logs/vote-simulation.json` – Deterministic
     nation voting transcript.
   - `reports/agi-os/` – Mission bundle, validator proofs, and owner matrix
     outputs from the operating system simulation.
   - `demo/cosmic-omni-sovereign-symphony/logs/flagship-demo/summary.txt` – Human
     readable recap tying all artefacts together.
   - Optional verification: run
     `node demo/cosmic-omni-sovereign-symphony/scripts/verify-flagship-report.mjs`
     to produce `logs/flagship-demo/verification.json`, which fails the run if
     any governance, owner control, or mission bundle evidence is missing.
3. **Share dashboards** by importing the JSON payloads in
   `demo/cosmic-omni-sovereign-symphony/dashboards/` into Grafana/Chronograf. The
   Mermaid architecture diagram (`docs/architecture.mmd`) can be rendered for
   executive briefings.

## Owner Control Validation

- The governance scripts deploy `GlobalGovernanceCouncil` with the operator
  account as owner and pauser when those fields are unset in
  `config/multinational-governance.json`, ensuring the runner retains emergency
  authority.
- `npm run owner:parameters` produces
  `reports/agi-os/owner-control-matrix.json`, enumerating every adjustable
  parameter surface so the owner can confirm full control before production use.
- The orchestration deliberately pauses and resumes governance during
  `simulate-governance.ts` to prove that the owner can halt the system at will
  while still allowing parameter updates once unpaused.

## Continuous Integration Alignment

A dedicated GitHub Actions workflow (see
`.github/workflows/demo-cosmic-flagship.yml`) executes the flagship demo with the
`--ci --dry-run` flags on every relevant pull request. This keeps the
multinational rehearsal, AGI OS simulation, and owner parameter export green in
CI, satisfying the "fully green V2" requirement and making the check visible on
PRs and the `main` branch.

## Troubleshooting & Extensions

- **Hardhat node ports in use** – Stop existing local nodes or set
  `HARDHAT_NETWORK` variables before running `flagship-demo.sh`.
- **Mermaid CLI missing** – Install `@mermaid-js/mermaid-cli` (`npm install -g
  @mermaid-js/mermaid-cli`) if automated SVG exports are required; the runbook is
  otherwise unaffected.
- **Live network deployment** – Remove `--dry-run` only after funding the
  configured deployer keys and confirming the gas policy. The scripts will prompt
  for confirmation before broadcasting to protect mainnet usage.

This playbook, coupled with the existing automation, delivers the "Operating
System for AGI Work" demonstration end-to-end without introducing new contracts
or features, while maintaining complete owner oversight and production readiness.
