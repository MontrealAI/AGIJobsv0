# INFINITY OMNISOVEREIGN FIRST-CLASS OPERATING SYSTEM 🚀

> _A push-button, non-technical launch experience for the AGI Jobs v0 (v2) Operating System_

This showcase packages the full **AGI Jobs v0 (v2) Astral Omnidominion Operating System** demo into a single, guided experience. It reuses the repository's production tooling (deployment wizard, first-class mission rehearsal, governance dashboards, and audit bundle generation) so that a business operator can rehearse a planet-scale mission with zero manual wiring.

The experience is built entirely from first principles on top of existing repo functionality:

- **No-install bootstrap.** Leverages the `deploy:oneclick` stack to stand up contracts, orchestrators, web portals, and monitoring inside Docker.
- **Interactive operator wizard.** The `demo:agi-os:first-class` TypeScript orchestrator walks the owner through preflight checks, network selection, deployment, and the complete AGI OS rehearsal.
- **Live status and HTML dossiers.** Every phase streams progress to the terminal, emits structured JSON, Markdown, and HTML reports, and produces SHA-256 manifests for audit-grade traceability.
- **Owner command centre ready.** The resulting Owner Control Matrix, Mermaid diagrams, and governance dashboard point the operator at every lever (pause, resume, parameter updates) required to run the business safely.

## 📦 Quick start (push-button launch)

```bash
npm install
npm run demo:agi-os:first-class
```

The orchestrator will:

1. Offer a guided wizard (local Hardhat/Anvil is the default, no key management required).
2. Bootstrap the one-click stack (Docker compose) and deploy the full protocol with emergency pause engaged.
3. Execute the AGI OS grand demonstration (`demo:agi-os`) which compiles, simulates, and packages the ASI take-off mission bundle.
4. Render the executive HTML dossier, owner control diagram, and manifest.
5. Write an integrity report under `reports/agi-os/first-class/` summarising every step, exit code, artefact hash, and environment detail.

> **Tip:** Pass `--yes` for a fully non-interactive run, or `--network sepolia` to target the Sepolia presets with your governance keys. All options are documented via `npm run demo:agi-os:first-class -- --help`.

## 🧭 Operator flow

1. **Preflight readiness** – Docker, Docker Compose, Node, and git cleanliness are verified before any stateful actions occur. Failures emit actionable remediation guidance.
2. **One-click deployment** – The wizard reuses `scripts/v2/oneclick-wizard.ts`, applying the selected deployment config and `.env` template. Ownership starts paused so the operator has full control before enabling jobs.
3. **Grand demonstration** – `scripts/v2/agiOperatingSystemDemo.ts` compiles the contracts, performs the deterministic labour market rehearsal, and refreshes the mission bundle.
4. **Control surface verification** – The demo renders the owner Mermaid diagram (`owner:diagram`) and runs `owner:verify-control` to confirm every governance surface and updater is accounted for.
5. **Dossier rendering** – Markdown and JSON summaries are converted into HTML, a manifest with SHA-256 hashes is generated, and a final integrity check cross-references the control matrix and bundle artefacts.

At completion you will find:

- `reports/agi-os/grand-summary.md` – executive report for non-technical stakeholders.
- `reports/agi-os/grand-summary.html` – ready-to-share HTML dossier.
- `reports/agi-os/first-class/first-class-run.json` – machine-readable log of every step, timestamp, exit code, and note.
- `reports/agi-os/first-class/first-class-manifest.json` – audit trail with hashes for each artefact.
- `reports/agi-os/first-class/owner-control-map.mmd` – Mermaid diagram for the owner command centre.

## 🌐 User interfaces (no-code control centre)

With the stack running (`docker compose ps`), open the production UIs that ship in the repo:

| Role | URL | Capabilities |
| ---- | --- | ------------ |
| Owner Console | http://localhost:3000 | Pause/resume modules, update parameters, execute governance calls, review receipts. |
| Enterprise Portal | http://localhost:3001 | Guided job submission with conversational forms and "Submit job" confirmation button. |
| Validator Dashboard | http://localhost:3002 | Monitor validation queues, commit/reveal results, and observe job flow in real time. |
| One-Box Assistant | http://localhost:4173 (after `npm --prefix apps/console run preview`) | Natural-language orchestration with confirm/deny controls; can operate in demo mode for zero-wallet rehearsals. |

These interfaces consume the same stack deployed by the wizard, so every action (e.g. pressing the pause button) interacts with the live contracts you just deployed. Because SystemPause retains emergency authority, the contract owner can halt or resume the platform instantly.

## 🔐 Owner control guarantees

- The **Owner Control Matrix** enumerates every module, config file, and update script, highlighting any gaps (`needs-config` or `missing-surface`).
- `owner:verify-control` re-validates that SystemPause can forward governance setters, guaranteeing the owner can change fees, staking thresholds, or rewards without redeployment.
- The demo runs with the platform paused by default. Unpausing (via Owner Console or `npm run owner:command-center`) proves that the operator holds the master switch.

## ✅ CI & production readiness

This demo reuses the full CI v2 surface:

- `demo:agi-os` internally triggers contract compilation, deterministic simulation, thermodynamic telemetry collection, and report packaging — mirroring the CI flow.
- Run `npm run lint`, `npm test`, `npm run coverage`, and `npm run ci:verify-branch-protection` to locally confirm the repository matches the enforced GitHub checks before shipping.
- The generated manifest includes git commit, docker/compose versions, and SHA-256 hashes so auditors can reproduce or verify every artefact.

## 🛠️ Troubleshooting

| Symptom | Resolution |
| ------- | ---------- |
| Docker not detected | Install Docker Desktop (macOS/Windows) or Docker Engine + Compose plugin (Linux). Re-run the demo afterwards. |
| Wizard cannot reach Sepolia | Provide funded governance signer keys in `deployment-config/oneclick.env` and ensure the RPC URL is reachable. |
| UI cannot connect | Verify containers are running (`docker compose ps`). Restart with `docker compose up -d` from the repo root. |
| Artefact integrity check fails | Inspect `reports/agi-os/first-class/logs/` for step-specific logs. Re-run once issues are resolved; hashes will refresh automatically. |

## ♻️ Resetting the environment

```bash
docker compose down -v
rm -rf reports/agi-os reports/asi-takeoff
```

This returns the repository to a pristine state so you can perform the demonstration again (for investors, auditors, or training sessions).

---

For a narrated walkthrough, combine this README with the Owner Control Quickstart (`npm run owner:quickstart`) and Mission Control (`npm run owner:mission-control`) scripts to brief stakeholders before launching the push-button demo.
