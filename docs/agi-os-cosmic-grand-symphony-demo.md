# AGI Jobs v0 (v2) – Cosmic Omniversal Grand Symphony Demo Guide

This guide documents the production-grade workflow for the **Cosmic Omniversal Grand Symphony** demonstration – the “first-class operating system” experience for AGI Jobs v0 (v2). It stitches together only existing tooling (Docker one-click deploy, `demo:agi-os:first-class`, owner control verifiers, and reporting utilities) so operators can execute a complete mission rehearsal with zero code changes.

## Audience

- **Business owners / executives** who need a push-button way to validate that their AGI Jobs deployment is operational, controllable, and safe.
- **Compliance / audit teams** who require verifiable artefacts (hash manifests, mission summaries, governance matrices) generated directly from the platform.
- **Protocol engineers** who want a repeatable, scripted rehearsal that mirrors CI v2 checks without modifying production logic.

## Prerequisites

- Docker Desktop or Docker Engine + Compose.
- Git and Node.js (Node 20+ is included via repo tooling; the demo itself orchestrates Node through npm scripts).
- A terminal session with access to the cloned repository.

## Launch Checklist

1. **Clone the repository** and enter it:
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   ```
2. **Optional** – verify branch protection and CI enforcement:
   ```bash
   npm run ci:verify-branch-protection
   ```
3. **Run the demo** using either path:
   ```bash
   npm run demo:agi-os:first-class
   # or
   demo/cosmic-omniversal-grand-symphony/bin/grand-symphony.sh
   ```
4. **Respond to wizard prompts** (network selection, Docker confirmation, governance signer details). Defaults target the local Hardhat (Anvil) network for a deterministic rehearsal.
5. **Monitor progress** – the script streams emoji-coded updates for every stage (preflight, deployment, simulation, governance synthesis, audit packaging, integrity verification).
6. **Open interfaces** when instructed:
   - Owner Console: `http://localhost:3000`
   - Enterprise Portal: `http://localhost:3001`
   - Validator Dashboard: `http://localhost:3002`
7. **Collect artefacts** from `reports/agi-os/` (Markdown/HTML summaries, control matrix JSON, manifests, telemetry logs). Each rerun overwrites these directories, ensuring fresh evidence.

## Outputs

| File | Purpose |
| --- | --- |
| `reports/agi-os/grand-summary.md` | Executive-friendly summary of the mission rehearsal. |
| `reports/agi-os/grand-summary.html` | HTML rendering for sharing with stakeholders. |
| `reports/agi-os/owner-control-matrix.json` | Machine-readable catalogue of every governable module, status, and update script. |
| `reports/agi-os/first-class/first-class-run.json` | Telemetry per orchestration step, including duration, exit code, and notes. |
| `reports/agi-os/first-class/first-class-manifest.json` | SHA-256 hashes for all generated artefacts, supporting audit trails. |
| `reports/agi-os/first-class/owner-control-map.mmd` | Mermaid diagram of owner/timelock relationships and pause circuitry. |
| `reports/agi-os/first-class/logs/*.log` | Raw stdout/stderr captured for reproducibility. |

These outputs align with the CI v2 artefacts, ensuring the demonstration reflects production readiness.

## Owner Control Responsibilities

- **Pausing/Resuming** – use the Owner Console or run `npm run owner:command-center -- --action pause-all --network <network>` to halt the protocol instantly. Resume with `--action unpause-all` after verification.
- **Parameter Updates** – the Owner Control Matrix lists each updater script (e.g., thermodynamics, staking manager). Execute the referenced `npx hardhat run` scripts or use the Owner Console forms to apply changes.
- **Emergency Runbook** – trigger `npm run owner:emergency` for a step-by-step incident response procedure if an anomaly is detected during the demo.

## Troubleshooting

- **Docker not running** – start Docker Desktop / Engine and rerun the demo. The preflight stage will revalidate.
- **Wizard prompts loop** – ensure the terminal is interactive; add `--yes` to run headless (`npm run demo:agi-os:first-class -- --yes`).
- **Port conflicts** – stop other services on ports 3000-3002 or adjust Compose overrides before launching.
- **CI mismatch** – rerun the demo, then execute `npm run ci` locally. Compare logs to `reports/agi-os/first-class/first-class-run.json` to ensure parity.

## Reset & Re-run

To return to a clean slate:
```bash
rm -rf deployment-config/generated \
       reports/agi-os \
       reports/asi-takeoff
```
Re-execute the demo command to regenerate artefacts and mission bundles from scratch.

## Governance Assurance

The demonstration confirms that:

- Contracts deploy paused, with the SystemPause timelock retaining emergency control.
- The owner can update or reconfigure every module via documented scripts or the Owner Console UI.
- All artefacts required for audits (summaries, manifests, telemetry) are produced deterministically with hashes for verification.
- CI v2 checks remain green—running the demo reruns the same compilation, simulation, and verification gates enforced in GitHub Actions.

By following this guide, non-technical leaders, auditors, and engineers can reproduce the full AGI Jobs operating system rehearsal and prove that the platform is unstoppable, secure, and completely governed by the contract owner.
