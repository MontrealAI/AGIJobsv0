# Omni-Sovereign Ascension Mission Playbook

This playbook distils the governance, observability, and audit moves required to run the Omni-Sovereign Ascension Operating System Showcase in a production-critical rehearsal. Every step references scripts and tooling that are already present in AGI Jobs v0 (v2).

---

## Phase 0 – Preflight Validation

| Check | Command | Notes |
| --- | --- | --- |
| Verify Node.js version | `node --version` | Must read `v20.18.1` to match the locked toolchain. |
| Verify Docker Engine | `docker --version` | Required for the one-click stack. |
| Verify Docker Compose | `docker compose version` | Compose V2 or newer. |
| Verify Git state | `git status --short` | Should be clean to guarantee reproducible mission bundles. |

If any prerequisite fails, resolve it before continuing. Record terminal transcripts for the audit trail.

---

## Phase 1 – Launch Stack via One-Click Wizard

1. Ensure `.env` inputs are generated (optional but recommended):
   ```bash
   npm run deploy:env
   ```
2. Start the wizard:
   ```bash
   npm run deploy:oneclick:wizard
   ```
3. Accept the default **Local Hardhat (Anvil)** network unless you have pre-funded Sepolia keys.
4. When prompted for governance addresses, paste your multisig or accept the deterministic demo owner.
5. Confirm the summary screen, then monitor the live status updates. The wizard automatically pauses every contract upon completion.

Artifacts to capture:
- `deployment-config/oneclick.env`
- `reports/deployments/latest/oneclick-deploy.json`
- Docker Compose logs (optional)

---

## Phase 2 – Execute the First-Class Operating System Demo

1. Run the automation:
   ```bash
   npm run demo:agi-os:first-class -- --auto-yes
   ```
2. Observe the progress stream:
   - ✅ **Compilation** – Hardhat build
   - ✅ **ASI Take-Off** – deterministic labour market simulation
   - ✅ **Owner Matrix** – control surface synthesis
   - ✅ **Mission Bundle** – SHA-256 manifest written to `reports/agi-os/first-class/`
3. Validate outputs:
   - Open `reports/agi-os/grand-summary.md`
   - Inspect `reports/agi-os/owner-control-matrix.json`
   - Confirm `reports/agi-os/first-class/first-class-run.json`

Audit move:
```bash
jq '.entries[] | {path, sha256}' reports/agi-os/first-class/first-class-manifest.json
```
Document the hashes inside your operations log.

---

## Phase 3 – Hands-On Control Drills

### A. Using the Owner Console UI

1. Browse to http://localhost:3000.
2. Connect the governance wallet (the wizard outputs the private key for local demos).
3. Execute the following actions via the UI forms:
   - **Unpause All Modules** (System Pause → Resume button)
   - **Update Thermostat Parameters** (select the relevant form, adjust values, submit)
   - **Re-run Snapshot** if prompted (Owner Snapshot panel)
4. After each action, verify the corresponding receipt in the UI and cross-check with `reports/agi-os/owner-control-matrix.json`.

### B. Using Existing Scripts (CLI)

Run drills directly from the repository scripts:

```bash
npm run pause:test
npm run owner:emergency
npm run owner:command-center
```

Review the generated reports inside `reports/owner/` to ensure every control surface is reachable.

---

## Phase 4 – Workforce Simulation via Enterprise Portal

1. Open http://localhost:3001.
2. Follow the conversational wizard to create a job (use small token amounts for local runs).
3. Observe real-time updates as the orchestrator routes the task to validators.
4. Optionally, open http://localhost:3002 to see the validator queue update live.

Capture screenshots of key UI screens for inclusion in stakeholder briefings.

---

## Phase 5 – CI v2 & Branch Protection Audit

1. Run the local CI battery to mirror GitHub checks:
   ```bash
   npm run lint:ci
   npm run test
   npm run coverage:check
   npm run check:access-control
   npm run ci:verify-branch-protection
   ```
2. Record the exit status of each command. Any non-zero result must be remediated before proceeding.
3. Confirm GitHub branch protections align with the CI v2 standard (five required jobs + companion workflows). Use the output from `ci:verify-branch-protection` to double-check.

---

## Phase 6 – Mission Debrief & Archival

1. Assemble the following artifacts into a secure archive:
   - `reports/agi-os/` directory (including `grand-summary.*` and `first-class/` bundle)
   - Terminal transcripts from Phases 1–5
   - Screenshots from UIs
   - Any decision logs or approvals
2. Compute an overall manifest for the archive if required (`shasum -a 256 <file>`).
3. Share the bundle with stakeholders; the documentation is executive-readable out of the box.

---

## Incident Response & Safety Notes

- The system remains paused until you issue an explicit unpause. Re-run `npm run pause:test` after any governance change to ensure the kill-switch operates correctly.
- For Sepolia or mainnet rehearsals, ensure multisig confirmations are collected and recorded in the archive.
- Use `npm run owner:doctor` if any module reports `needs-config` inside the control matrix.

---

## Continuous Improvement

Log observations, bottlenecks, or UX friction while executing this playbook. Feed them into the existing Owner Mission Control pipeline (`npm run owner:mission-control`) to generate updated action plans using the repository’s planner modules.

This playbook deliberately avoids new custom code. Every command is already part of AGI Jobs v0 (v2), ensuring upgrades remain compatible with upstream CI and security reviews.
