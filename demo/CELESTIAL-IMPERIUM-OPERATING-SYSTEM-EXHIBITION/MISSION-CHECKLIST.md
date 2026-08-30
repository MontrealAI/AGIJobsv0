# Celestial Imperium Mission Control Checklist

This checklist mirrors the workflow executed by the Astral Omnidominion First-Class demo script so operators can monitor progress
and capture audit notes in real time.

## Phase 0 – Preparation

- [ ] Confirm Docker Desktop (or Docker Engine + Compose plugin) is installed and running.
- [ ] Ensure at least 15 GB of free disk space for container layers and mission artefacts.
- [ ] If connecting to Sepolia, fund the governance signer or multisig ahead of time.
- [ ] (Optional) Run `npm install` to warm the dependency cache for faster execution.

## Phase 1 – Launch the Exhibition

- [ ] Execute `demo/CELESTIAL-IMPERIUM-OPERATING-SYSTEM-EXHIBITION/bin/launch.sh` from the repository root.
- [ ] When prompted for a network, select `1` (Local Hardhat) unless a testnet rehearsal is required.
- [ ] Accept the proposal to launch Docker Compose unless services are already running.
- [ ] Review the configuration summary and approve the deployment wizard.

## Phase 2 – Observe Mission Stages

Use the console output to tick off each stage as it completes:

- [ ] **Preflight checks** report Docker, Compose, Node, and git status.
- [ ] **One-click deployment wizard** completes successfully.
- [ ] **AGI OS grand demonstration** produces ASI take-off telemetry and reports.
- [ ] **Owner systems map** renders the latest Mermaid diagram.
- [ ] **Owner control verification** validates the governance surface.
- [ ] **HTML renderer** emits `reports/agi-os/grand-summary.html`.
- [ ] **First-class manifest** enumerates artefacts with SHA-256 hashes.
- [ ] **Integrity reconciliation** completes with ✅ status.

## Phase 3 – Review Artefacts

- [ ] Open `reports/agi-os/grand-summary.md` and confirm mission details match expectations.
- [ ] Inspect `reports/agi-os/owner-control-matrix.json` for any modules flagged `needs-config` or `missing-surface`.
- [ ] Archive the entire `reports/agi-os/` directory for compliance storage.
- [ ] Share the bundle with stakeholders alongside SHA-256 checksums from the manifest.

## Phase 4 – Governance & CI Assurance

- [ ] Execute the CI v2 commands listed in the README to mirror production guardrails.
- [ ] Run `npm run ci:verify-branch-protection` and capture the output with the mission records.
- [ ] If any governance parameter changes are required, use the Owner Console or supplied Hardhat scripts and re-run the
      exhibition afterwards.

## Phase 5 – Shutdown

- [ ] When satisfied, run `docker compose down --remove-orphans` to stop infrastructure.
- [ ] Store copies of the generated logs under `reports/agi-os/first-class/logs/` for forensic readiness.

Mission accomplished once every checkbox is ticked.
