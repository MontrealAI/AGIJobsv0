# AGI Jobs v0 (v2) Flagship Demo Runbook

This runbook explains how a non-technical owner can execute the full "Operating
System for AGI Work" showcase using only the tooling that already ships in the
repository.

## Objectives

- Deploy and exercise the `GlobalGovernanceCouncil` with simulated multi-nation
  voters and owner-controlled pausing.
- Replay the AGI labour market mission bundle (jobs, validators, payouts) using
  the existing `npm run demo:agi-os` script.
- Produce audit-grade artefacts that confirm the owner can adjust every
  governance and economic parameter at will.
- Surface UI/UX endpoints (One-Box portal, validator dashboard, owner console)
  for stakeholders to interact with during the rehearsal.

## 1. Environment Preparation

1. Clone the repository and switch to the desired branch (typically `main`).
2. Copy the provided `.env` template and insert RPC URLs plus wallet keys:
   ```bash
   cp demo/cosmic-omni-sovereign-symphony/config/.env.example \
      demo/cosmic-omni-sovereign-symphony/.env
   ```
3. Ensure Docker is available if you plan to launch the UI layer via the
   existing one-click stack (`npm run deploy:oneclick:auto -- --network
   localhost --compose`).

## 2. Execute the Flagship Launcher

Run the wrapper script from the repository root. The `--dry-run` flag keeps all
transactions local to the Hardhat network, making it safe for repeated
rehearsals.

```bash
demo/cosmic-omni-sovereign-symphony/bin/flagship-demo.sh --dry-run
```

What happens under the hood:

1. `npm ci` reproduces the exact dependency tree enforced by CI v2.
2. `bin/orchestrate.sh` spins up a Hardhat node, deploys
   `GlobalGovernanceCouncil`, seeds nation wallets from
   `config/multinational-governance.json`, records their votes, and runs the
   owner pause/unpause drill.
3. The script switches to the repository root and runs `npm run demo:agi-os`,
   which performs the AGI labour-market simulation (job postings, agent
   completions, validator commit/reveal votes, thermodynamic adjustments) and
   assembles the mission bundle in `reports/agi-os/`.
4. `npm run owner:parameters` generates
   `reports/agi-os/owner-control-matrix.json`, demonstrating exactly which
   commands the owner may use to tune fees, staking thresholds, reward engines,
   pausers, etc.
5. If the Mermaid CLI is available (`mmdc` binary or
   `@mermaid-js/mermaid-cli`), the architecture diagram in
   `docs/architecture.mmd` is converted to SVG for boardroom slides.
6. A concise summary of all outputs is written to
   `logs/flagship-demo/summary.txt` for rapid sharing.

## 3. Review Artefacts

- **Governance evidence:**
  `demo/cosmic-omni-sovereign-symphony/logs/ledger-latest.json` and
  `vote-simulation.json` log every vote, quorum status, and owner intervention.
- **Mission bundle:** Located at `reports/agi-os/` and includes `grand-summary`
  (executive report), `manifest.json` (checksums), `mission-bundle/` (full data
  room), and thermodynamic telemetry.
- **Owner authority:** `reports/agi-os/owner-control-matrix.json` plus the
  optional Mermaid SVG prove that the owner can pause, update parameters, rotate
  controllers, and execute safe-upgrade plans without redeploying contracts.

## 4. UI Touchpoints (optional)

If you launched the Docker stack beforehand, the following URLs become
available for live interaction while the scripts run:

- `http://localhost:3000` – Owner console with pause/resume controls and status
  dashboards.
- `http://localhost:3001` – Enterprise One-Box portal for natural-language job
  submission using the Job Registry.
- `http://localhost:3002` – Validator UI for commit/reveal voting with wallet
  signatures handled by the front-end.

These interfaces read from the same local Hardhat network used by the demo,
allowing stakeholders to observe or participate in real time without touching
command-line tooling.

## 5. Post-Run Governance Exercises

To rehearse parameter changes after the flagship script completes:

```bash
npm run owner:wizard
npm run owner:update-all -- --only thermostat --network hardhat
npm run owner:verify-control
```

These commands, executed from the repository root, validate that the owner can
modify thermostat policies (or any other module), push safe transaction bundles,
and verify the resulting addresses against the canonical config.

## 6. Clean-up

- Stop the Hardhat node spawned by `bin/orchestrate.sh` (the flagship launcher
  handles this automatically on exit, but double-check with `pkill -f
  "hardhat"`).
- If Docker was used, shut down the stack with `docker compose down
  --remove-orphans`.

All generated artefacts remain in place so they can be archived, committed to
`reports/`, or shared with auditors.

---

**Outcome:** After following this runbook a non-technical operator holds a
battle-tested, mainnet-ready mission report demonstrating governance,
automation, UI readiness, and total owner authority over the AGI Jobs v0 (v2)
platform.
