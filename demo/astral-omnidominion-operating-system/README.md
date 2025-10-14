# Astral Omnidominion Operating System Demo ✨

The **Astral Omnidominion Operating System Demo** packages the entire AGI Jobs v0 (v2) stack into an iconic, one-button showcase. It builds on the existing `demo:agi-os` mission rehearsal, layers in first-class owner tooling, and emits audit-grade bundles that non-technical operators can run locally or on a staging network with zero code changes.

> **Purpose** – prove that a business operator can deploy, govern, and audit an AGI labour market from a clean machine with a single command, while keeping absolute pause/update authority at all times.

## Feature Highlights

- 🚀 **Push-button launch** – runs the one-click containerised stack, executes the ASI take-off simulation, and collects the mission bundle with live progress indicators.
- 🛰️ **Owner mission control** – renders fresh Mermaid system maps, verifies the governance control surface, and synthesises an Owner Control Authority Matrix.
- 📦 **Audit-ready evidence** – writes signed logs, SHA-256 manifests, Markdown + HTML dossiers, and pointers to the Owner Console, Enterprise Portal, and Validator Dashboard.
- 🛡️ **Safety first** – pauses the protocol by default, confirms every destructive action, and shows how to resume/adjust parameters with existing owner scripts.

## Quick Start (Non-Technical Friendly)

1. **Prerequisites** – install Docker Desktop (or Docker Engine + Compose). Node.js 20.18.1 is bundled in the repo, no global install required.
2. **Clone** – `git clone https://github.com/MontrealAI/AGIJobsv0.git && cd AGIJobsv0`.
3. **Launch** – run either command:
   - `npm run demo:agi-os:first-class`
   - `demo/astral-omnidominion-operating-system/bin/astral-omnidominion.sh`
4. **Follow the prompts** – choose your target network (local Hardhat by default), confirm Docker Compose boot, and let the orchestration drive the deployment plus demo.
5. **Open the dashboards** when prompted:
   - Owner Console → `http://localhost:3000`
   - Enterprise Portal → `http://localhost:3001`
   - Validator Dashboard → `http://localhost:3002`
6. **Review the bundle** – results land in `reports/agi-os/` with a dedicated `first-class/` subdirectory that contains logs, manifests, and an HTML version of the grand summary suitable for executive briefings.

The script finishes by replaying every CI gate that the demo touches. A green run is equivalent to a green CI rehearsal.

## Generated Artefacts

| Artefact | Location | Notes |
| --- | --- | --- |
| Grand mission summary (Markdown) | `reports/agi-os/grand-summary.md` | Executive-level recap of the simulation run. |
| Grand mission summary (HTML) | `reports/agi-os/grand-summary.html` | Rendered automatically for stakeholder sharing. |
| Owner Control Matrix | `reports/agi-os/owner-control-matrix.json` | Enumerates every governable/ownable module and its update path. |
| First-class run ledger | `reports/agi-os/first-class/first-class-run.json` | Structured telemetry for each orchestration step. |
| Step logs | `reports/agi-os/first-class/logs/*.log` | Timestamped stdout/stderr for reproducibility. |
| SHA-256 manifest | `reports/agi-os/first-class/first-class-manifest.json` | Audit trail linking all artefacts with hashes and byte sizes. |
| Owner systems map (Mermaid) | `reports/agi-os/first-class/owner-control-map.mmd` | Graph of controllers, modules, and current owners. |

All files include ISO 8601 timestamps so you can prove freshness.

## End-to-End Flow

1. **Preflight** – verifies Docker, Docker Compose, Node.js version, and repository cleanliness.
2. **One-click deployment** – wraps `npm run deploy:oneclick:wizard` with sensible defaults, generating `deployment-config/latest-deployment.json` and updating the `.env` stack.
3. **Mission execution** – invokes `npm run demo:agi-os` which compiles contracts, runs the thermodynamic ASI simulation, and writes the mission dossier.
4. **Governance validation** – regenerates the owner systems map, runs `npm run owner:verify-control`, and snapshots the Owner Control Authority Matrix.
5. **Audit packaging** – converts Markdown to HTML, builds the manifest, and consolidates logs for inspection.

Every stage streams emoji-coded status lines so the operator always knows what is happening. Failures are trapped, logged, and reported alongside immediate remediation tips.

## Operating the Platform After the Demo

- Use the **Owner Console** to unpause modules, tweak fee/treasury settings, and submit governance transactions with wallet-based confirmation.
- Visit the **Enterprise Portal** to submit a job via conversational form – the validator queue updates in real-time once the simulation data is loaded.
- Trigger emergency stops at any time with `npm run owner:command-center -- --action pause-all --network <network>`; the demo leaves the timelock/owner account in full control so no functionality is removed.

For the complete walk-through (including screenshots and troubleshooting), open [`docs/agi-os-first-class-demo.md`](../../docs/agi-os-first-class-demo.md).

## Resetting Between Runs

The demo is idempotent – simply rerun the command. To wipe local state completely:

```bash
rm -rf deployment-config/generated \
       reports/agi-os \
       reports/asi-takeoff
```

Then re-run the demo to regenerate everything from scratch.

## Support & Escalation

- **Operational questions** – see [`docs/owner-control-non-technical-guide.md`](../../docs/owner-control-non-technical-guide.md).
- **Incident response** – execute `npm run owner:emergency` for the emergency runbook.
- **CI alignment** – the `first-class-run.json` report references each CI-equivalent step; verify branch protections with `npm run ci:verify-branch-protection` if needed.

Run the Astral Omnidominion demo whenever you need to prove the platform’s readiness to stakeholders, auditors, or regulators.
