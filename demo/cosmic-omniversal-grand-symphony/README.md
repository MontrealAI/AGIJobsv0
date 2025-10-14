# Cosmic Omniversal Grand Symphony Demo 🌌

The **Cosmic Omniversal Grand Symphony Demo** delivers the “AGI Jobs v0 (v2) – First-Class Operating System Demonstration 🚀” using only battle-tested functionality that already ships in this repository. It layers a non-technical launch guide, push-button orchestration, and audit-grade evidence on top of the proven `demo:agi-os` rehearsal so that any operator can run the entire mission with zero code edits.

> **Mission** – prove, end-to-end, that a single click gives a business owner unstoppable control over a planetary AGI labour market while keeping every contract parameter, pause switch, and governance lever under their authority.

## Core Capabilities

- 🚀 **One command orchestration** – wraps the one-click Docker stack, executes `npm run demo:agi-os:first-class`, and streams emoji-coded progress updates so non-technical stakeholders always understand what is happening.
- 🛰️ **Owner supremacy** – regenerates the Owner Control Authority Matrix, Mermaid governance diagrams, and timelock ownership ledger showing exactly how the owner can pause, resume, or retune every module immediately.
- 📦 **Audit & compliance** – outputs Markdown, JSON, and HTML dossiers under `reports/agi-os/` with SHA-256 manifests that match the CI artefacts. Every file is timestamped for evidentiary use.
- 🧭 **Wizard-guided inputs** – reuses the existing one-click deployment wizard so operators choose networks, governance keys, and environment settings through guarded prompts instead of manual file edits.
- 🛡️ **Safety-first defaults** – honours the repository’s secure deployment posture (contracts paused on boot, conservative thresholds, timelock forwarding) so the owner retains total control while the demo runs.

## Quick Start (Zero Code Required)

1. **Install Docker** – Docker Desktop (macOS/Windows) or Docker Engine + Compose (Linux) is enough. Node.js is vendored inside the repo toolchain.
2. **Clone the repo** – `git clone https://github.com/MontrealAI/AGIJobsv0.git && cd AGIJobsv0`.
3. **Launch the symphony** – run either command:
   - `npm run demo:agi-os:first-class`
   - `demo/cosmic-omniversal-grand-symphony/bin/grand-symphony.sh`
4. **Answer the wizard prompts** – pick your preferred network (local Hardhat by default), confirm Docker Compose start-up, and approve the deterministic ASI take-off rehearsal.
5. **Open the live interfaces** once instructed:
   - Owner Console → `http://localhost:3000`
   - Enterprise Portal → `http://localhost:3001`
   - Validator Dashboard → `http://localhost:3002`
6. **Review the evidence bundle** – inspect `reports/agi-os/` for `grand-summary.md`, `grand-summary.html`, the Owner Control Matrix, manifests, telemetry JSON, and Mermaid diagrams.

A green run here equals a green rehearsal of the CI v2 pipeline – compilation, deterministic simulation, governance verification, and manifest hashing all succeed in lockstep.

## Artefact Map

| Artefact | Location | Description |
| --- | --- | --- |
| Grand mission summary (Markdown) | `reports/agi-os/grand-summary.md` | Executive story of the AGI OS mission run. |
| Grand mission summary (HTML) | `reports/agi-os/grand-summary.html` | Browser-friendly rendition for board/executive review. |
| Owner Control Matrix | `reports/agi-os/owner-control-matrix.json` | Enumerates every governable module with update scripts and config status. |
| Control systems map | `reports/agi-os/first-class/owner-control-map.mmd` | Mermaid diagram of ownership, timelocks, and pause routes. |
| First-class telemetry | `reports/agi-os/first-class/first-class-run.json` | Step-by-step log of orchestration phases, durations, and exit codes. |
| SHA-256 manifest | `reports/agi-os/first-class/first-class-manifest.json` | Audit ledger linking each artefact to its digest, byte size, and timestamp. |

All directories are recreated on each run and include ISO 8601 timestamps for compliance.

## Full Flow

1. **Preflight checks** – validates Docker/Compose availability, Node version, git cleanliness, and environment readiness using existing verification routines.
2. **One-click deployment** – drives `npm run deploy:oneclick:wizard`, generating fresh `deployment-config/generated` assets and populating `.env` parameters.
3. **ASI take-off mission** – triggers `npm run demo:agi-os`, running the thermodynamic labour market simulation, compiling contracts, executing deterministic jobs/validation, and capturing telemetry.
4. **Governance synthesis** – rehydrates the Owner Control Authority Matrix, Mermaid diagrams, and system pause status so the owner sees every lever and the active timelock routing.
5. **Audit packaging** – renders Markdown → HTML, builds manifests, and archives stdout/stderr under `reports/agi-os/first-class/logs`.
6. **Integrity verification** – cross-checks manifests, hash coverage, and matrix totals. Any drift raises an immediate ❌ status with remediation hints.

The orchestration terminates with a compliance recap that mirrors the CI summary job. If any prerequisite fails, the wizard displays a plain-language fix so non-technical users can resolve it quickly.

## Operating After Launch

- Use the **Owner Console** to unpause modules, adjust protocol parameters, or forward governance calls through SystemPause with a wallet click.
- Submit a production-grade job through the **Enterprise Portal** – the validator queue updates in real-time and exercises the end-to-end labour pipeline.
- Trigger an emergency stop instantly with `npm run owner:command-center -- --action pause-all --network <network>` – the demo preserves full owner supremacy and never revokes critical permissions.

## Resetting Between Runs

```bash
rm -rf deployment-config/generated \
       reports/agi-os \
       reports/asi-takeoff
```

Re-run the grand symphony command to regenerate every artefact from scratch.

## Need Help?

- **Owner control handbook** – [`docs/owner-control-non-technical-guide.md`](../../docs/owner-control-non-technical-guide.md)
- **Emergency procedures** – `npm run owner:emergency`
- **CI enforcement** – `npm run ci:verify-branch-protection` validates required checks and branch protection rules.

Run the Cosmic Omniversal Grand Symphony whenever you need an iconic, production-ready showcase that the AGI Jobs Operating System is unstoppable, safe, and completely governed by the contract owner.
