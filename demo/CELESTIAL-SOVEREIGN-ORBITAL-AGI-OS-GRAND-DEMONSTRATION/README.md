# CELESTIAL SOVEREIGN ORBITAL AGI-OS GRAND DEMONSTRATION 🚀

> “Press one button. Command a planetary workforce. Retain absolute control.”

This playbook packages the **AGI Jobs v0 (v2) Operating System** into a first-class, non-technical showcase. It fuses the existing `demo:agi-os:first-class` pipeline, one-click container stack, enterprise/owner UX surfaces, and governance automation into a single, auditable experience. Everything here uses **only the code that already ships in this repository** – we simply wire it together, explain it clearly, and verify every guarantee.

---

## 1. Mission Overview

| Capability | What Happens | Evidence |
| --- | --- | --- |
| Autonomous ASI Take-Off | Deterministic blockchain simulation, thermodynamic telemetry, hashed mission bundle. | `npm run demo:agi-os:first-class` artefacts in `reports/agi-os/` |
| Owner Command Authority | Owner Control Matrix, pause/resume drills, governance forwarding ready. | `reports/agi-os/owner-control-matrix.json`, SystemPause actions |
| No-Install Launch | Docker Compose stack, local Anvil L1, web apps, services. | `npm run deploy:oneclick:wizard` (or `:auto`) |
| Push-Button UX | Enterprise Portal, Owner Console, Validator UI, One-Box planner. | `compose.yaml` services, live polling & confirmations |
| Audit-Grade Proof | SHA-256 manifests, mermaid diagrams, CI mirroring. | `reports/agi-os/first-class` outputs & `npm run ci:verify-branch-protection` |

**Outcome:** a business owner with zero coding skill can deploy, run, pause, and govern AGI Jobs – with the same assurance level our CI enforces on production.

---

## 2. Prerequisites (Triple-Verified)

1. **Docker Desktop 4.26+** (or engine 24+) with Compose v2 – validated via the preflight stage built into the demo runner.
2. **Node.js 20.18.1** – enforced by `.nvmrc` & checked during the demo preflight.
3. **Disk space**: ≥ 15 GB free for containers, build artefacts, and mission bundles.
4. **Optional**: Web browser with MetaMask (for portal) or use burner wallets provided by the orchestrator in demo mode.

> 🔍 _Self-check_: run `npm run demo:agi-os:first-class -- --auto-yes --skip-deployment --launch-compose=false` to execute the preflight without launching containers. The step fails fast if any prerequisite is missing.

---

## 3. Launch Sequence – Push-Button Planetary Ops

### Step 0 – Clean slate
```bash
npm install
rm -rf reports/agi-os reports/asi-takeoff
```
This ensures artefacts belong to the current mission.

### Step 1 – Guided one-click stack (no installs required)
```bash
npm run deploy:oneclick:wizard
```
* Accept the default **Local Hardhat (Anvil)** network.
* Confirm the pre-populated governance multisig (or paste your own EOA / Safe).
* Keep **Pause everything after deployment** = `Yes` (safety default).
* When prompted, the wizard will start Docker Compose, compile contracts, deploy, capture addresses, and store them under `deployment-config/oneclick.env`.

The same stack can be launched unattended for CI mirrors:
```bash
npm run deploy:oneclick:auto -- --yes --network localhost
```

### Step 2 – First-class OS demonstration
```bash
npm run demo:agi-os:first-class
```
The orchestrated steps include:
1. **Preflight** – Docker/Compose/Node/version/clean-git verification.
2. **Container bootstrap (optional)** – ensures the stack from Step 1 is up (skip with `--launch-compose=false`).
3. **ASI Take-Off** – runs `npm run demo:asi-takeoff:local`, generating deterministic on-chain labour simulations.
4. **Owner Control Intelligence** – executes `npm run owner:command-center`, `owner:doctor`, `owner:diagram`, collating matrices and mermaid diagrams.
5. **Mission Dossier** – renders `reports/agi-os/grand-summary.md` & `.json`, plus HTML transformation.
6. **Bundle Manifest** – SHA-256 digest of every artefact under `reports/agi-os/first-class`.

Watch the terminal: each phase emits ✅ / ⚠️ / ❌ status lines, logs are written to `reports/agi-os/first-class/logs/` for audit replay.

### Step 3 – Open the user interfaces
All web apps are already defined in `compose.yaml`; when the stack is running:
- **Owner Console** → http://localhost:3000
- **Enterprise Portal** → http://localhost:3001
- **Validator Command** → http://localhost:3002
- **One-Box Planner** → http://localhost:3003/?orchestrator=demo

Every UI confirms connection state, exposes big action buttons, and guides the user through workflows. Use the owner console to unpause/pause modules, the portal to submit example jobs, and the validator panel to observe review flows.

---

## 4. Owner Superuser Drill

1. **Unpause for operations**
   * In the Owner Console, open the _Governance Action_ form.
   * Select **SystemPause → unpauseAll**.
   * Sign the transaction with the governance key from the wizard summary.
   * Observe portal status widgets switch to “Ready”.

2. **Submit a flagship job**
   * In the Enterprise Portal, follow the conversational form.
   * Provide title/description/deadline/budget (demo tokens on local Anvil).
   * Hit the **Submit Job** green button; copy the transaction hash.
   * Check `reports/agi-os/grand-summary.json` → `mission.jobs[]` for recorded metadata.

3. **Re-engage global pause**
   * Run `npm run owner:command-center -- --action pause-all --network localhost` or use the console UI.
   * Verify the Owner Control Matrix marks SystemPause as `✅ Ready` and notes the executed command.

4. **Control Surface Audit**
   * Inspect `reports/agi-os/owner-control-matrix.json` (machine-readable) and `reports/agi-os/grand-summary.md` (executive view) for every module’s status (`ready`, `needs-config`, `missing-surface`).
   * Missing configs are flagged clearly so the owner can address them before mainnet launch.

---

## 5. Evidence Bundle Anatomy

After the run, the folder `reports/agi-os/first-class/` contains:

| Artefact | Description |
| --- | --- |
| `first-class-run.json` | Step-by-step timeline with durations, exit codes, git metadata, Docker versions. |
| `first-class-manifest.json` | SHA-256 for every grand-demo artefact (supply to auditors / regulators). |
| `owner-control-map.mmd` | Mermaid diagram (render with `npm run owner:diagram`) describing governance relationships. |
| `logs/*.log` | Structured logs for each stage; reproducible by rerunning the same step. |
| `../grand-summary.md` | Executive-friendly mission report – share as-is with stakeholders. |
| `../grand-summary.html` | Browser-ready version; open locally for the “boardroom presentation”. |

To regenerate the HTML view without rerunning the entire pipeline:
```bash
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/renderOwnerMermaid.ts
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/agiOperatingSystemDemo.ts --render-only
```

---

## 6. Live Diagram & Telemetry Highlights

* **Mermaid Governance Map** – produced via `npm run owner:diagram`; feed the `.mmd` into the Owner Console (Diagram tab) or any Mermaid renderer to visualise ownership, pausable modules, and upgrade pathways.
* **Thermodynamic Economics** – `reports/asi-takeoff/thermodynamics/` includes CSV + JSON telemetry for labour/capital flows. Cross-check using `npm run owner:doctor` for anomalies.
* **Mission Timeline** – the HTML summary links to every log so executives can click from the timeline to raw evidence.

---

## 7. CI & Production Readiness Checklist

1. **Full pipeline (local)**
   ```bash
   npm run lint:ci
   npm test
   npm run coverage
   npm run check:coverage
   npm run check:access-control
   npm run demo:agi-os:first-class -- --auto-yes --skip-deployment --launch-compose=false
   ```
2. **Branch protection**
   ```bash
   npm run ci:verify-branch-protection
   ```
   Ensure the required contexts match the v2 CI specification (Lint, Tests, Foundry Fuzz, Coverage, CI Summary, etc.).
3. **Container & Webapp checks (as per CI)**
   ```bash
   npm run webapp:build
   npm run security:audit
   ```

Document successful runs by committing the terminal transcripts to `reports/agi-os/first-class/logs/` or uploading them to your evidence locker.

---

## 8. Non-Technical Operator FAQ

**Q: What if something fails during the run?**  
Inspect the matching log under `reports/agi-os/first-class/logs/`. Each log begins with the command executed, timestamps, and captured stdout/stderr. Re-run the failed step once the issue is addressed.

**Q: How do I change treasury / fee parameters?**  
Use the Owner Console → Governance Action form to invoke the relevant updater (e.g., `Thermostat.updateConfig`). The Owner Control Matrix lists every command and required config file location.

**Q: Can I stop everything instantly?**  
Yes. SystemPause remains under the owner’s authority. Trigger **Pause All** from the console or run `npm run owner:command-center -- --action pause-all`.

**Q: Where is the blockchain state stored?**  
For local runs the Anvil chain lives in the `anvil-data` Docker volume. Reset by tearing down the stack: `docker compose down -v`.

**Q: How do I share the results?**  
Zip the `reports/agi-os/` folder. The manifest file includes hashes, so recipients can verify integrity with `shasum -a 256`.

---

## 9. Governance & Safety Hardening

* **Timelock / Multisig Ready:** the wizard lets you paste a Safe address; SystemPause forwards governance calls to managed modules without relinquishing emergency control.
* **Emergency Runbooks:** execute `npm run owner:emergency` for a ready-to-print tabletop guide (PDF-friendly Markdown).
* **Monitoring:** `npm run monitoring:sentinels` renders observability dashboard definitions; pair with Prometheus/Grafana stack in production.
* **Identity & Access:** review `npm run owner:verify-control` to confirm only intended signers hold administrative roles.

---

## 10. Next Actions

1. Run the guided demo end-to-end.
2. Invite executives to review `grand-summary.html` and walk through the Owner Console.
3. Commit the generated mission bundle (or store securely) as proof of readiness.
4. When satisfied, deploy to Sepolia/Mainnet using the same one-click flow and rerun the demo pointing at the new network.

> ✅ _Final reassurance_: the “First-Class” demo is the same sequence enforced by CI. A green run here means the platform is production-ready, secure, and entirely under the owner’s control.

---

### Appendix A – Command Reference (Copy & Paste)

| Command | Purpose |
| --- | --- |
| `npm run deploy:oneclick:wizard` | Interactive container + contract deployment. |
| `npm run deploy:oneclick:auto -- --yes` | Non-interactive deployment (CI parity). |
| `npm run demo:agi-os:first-class` | Full mission rehearsal with artefact bundle. |
| `npm run owner:command-center -- --action pause-all` | Global safety brake. |
| `npm run owner:command-center -- --action unpause-all` | Resume operations. |
| `npm run owner:diagram` | Render latest governance mermaid map. |
| `npm run owner:doctor` | Run owner control diagnostics. |
| `npm run owner:mission-control` | Summarise live configuration & health. |
| `npm run ci:verify-branch-protection` | Ensure GitHub requires every CI gate. |

---

### Appendix B – Artefact Locations

| Path | Contents |
| --- | --- |
| `reports/agi-os/grand-summary.md` | Executive narrative. |
| `reports/agi-os/grand-summary.json` | Machine-readable report. |
| `reports/agi-os/grand-summary.html` | Stakeholder deck. |
| `reports/agi-os/owner-control-matrix.json` | Updater manifest with statuses. |
| `reports/asi-takeoff/` | Simulation telemetry, scenario logs, thermodynamics. |
| `reports/agi-os/first-class/logs/` | Detailed logbook for every command. |

---

### Appendix C – Troubleshooting Signals

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| `docker: command not found` | Docker/Compose not installed. | Install Docker Desktop / Engine 24+. |
| `Owner key is not funded` error | Using Sepolia/mainnet without ETH. | Fund the governance signer, rerun wizard. |
| `needs-config` flags in matrix | Missing config JSON under `config/v2/...`. | Populate file, rerun `npm run demo:agi-os:first-class`. |
| Portal stuck on “Paused” | SystemPause still active. | Unpause from Owner Console or CLI command. |
| One-Box shows “Token required” | `ONEBOX_API_TOKEN` left as placeholder. | Set env or append `?orchestrator=demo` to URL for offline simulation. |

---

_This README is intentionally exhaustive so that a non-technical operator can execute the entire demonstration unaided while auditors, security teams, and engineers can trace every guarantee back to the artefacts generated by the canonical demo pipeline._
