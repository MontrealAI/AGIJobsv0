# Meta-Agentic Program Synthesis – Operator Runbook

> **Audience:** Non-technical owners, programme managers, and auditors orchestrating the Meta-Agentic Program Synthesis demo on
> local machines, testnets, or mainnet rehearsals.

## 1. Environment check

1. Install Node.js 20.18.1 (matching `.nvmrc`).
2. Install dependencies once: `npm ci`.
3. Optional: run Hardhat in a separate terminal if interacting with contracts (`npx hardhat node`).

## 2. Launch the sovereign forge

```bash
./demo/Meta-Agentic-Program-Synthesis-v0/bin/launch.sh
```

Expected log tail:

```
✅ Meta-Agentic Program Synthesis dossier generated.
✅ Meta-Agentic Program Synthesis full pipeline completed.
```

The launcher exports `AGI_META_PROGRAM_MISSION` and `AGI_OWNER_DIAGNOSTICS_OFFLINE=1` so that owner diagnostics run in offline mode.

## 3. Review artefacts

- Markdown dossier: `demo/Meta-Agentic-Program-Synthesis-v0/reports/meta-agentic-program-synthesis-report.md`
- Executive dashboard: `.../meta-agentic-program-synthesis-dashboard.html`
- JSON summary: `.../meta-agentic-program-synthesis-summary.json`
- Full-run bundle: `.../meta-agentic-program-synthesis-full.{json,md}`
- CI verification: `.../meta-agentic-program-synthesis-ci.json`
- Owner diagnostics: `.../meta-agentic-program-synthesis-owner-diagnostics.{json,md}`
- Manifest: `.../meta-agentic-program-synthesis-manifest.json`

## 4. Exercise owner controls (copy-paste ready)

```bash
# Pause and resume the entire platform
npm run owner:system-pause -- --action pause
npm run owner:system-pause -- --action status
npm run owner:system-pause -- --action unpause

# Recalibrate the reward engine thermostat using the mission file
npm run thermostat:update -- --mission demo/Meta-Agentic-Program-Synthesis-v0/config/mission.meta-agentic-program-synthesis.json
npm run thermodynamics:report

# Queue a sovereign upgrade (dry-run)
npm run owner:upgrade -- --mission demo/Meta-Agentic-Program-Synthesis-v0/config/mission.meta-agentic-program-synthesis.json
npm run owner:upgrade-status

# Refresh reward engine mirrors and compliance dossier
npm run reward-engine:update -- --mission demo/Meta-Agentic-Program-Synthesis-v0/config/mission.meta-agentic-program-synthesis.json
npm run reward-engine:report
npm run owner:compliance-report
```

All commands are idempotent offline. Point `HARDHAT_NETWORK` to a live network to operate real deployments.

## 5. Verify CI shield manually (optional)

```bash
npm run demo:meta-agentic-program-synthesis
npm run demo:meta-agentic-program-synthesis:full
jq '.' demo/Meta-Agentic-Program-Synthesis-v0/reports/meta-agentic-program-synthesis-ci.json
```

The CI report must confirm the workflow name `ci (v2)`, jobs `lint/tests/foundry/coverage`, `cancel-in-progress: true`, and
coverage ≥90.

## 6. Custom missions

1. Copy `config/mission.meta-agentic-program-synthesis.json` to a new file.
2. Update parameters (`seed`, `populationSize`, `tasks[].owner`, `ownerControls`) as desired.
3. Run with `AGI_META_PROGRAM_MISSION=/path/to/custom.json ./demo/Meta-Agentic-Program-Synthesis-v0/bin/launch.sh`.
4. New manifests and reports will reference the custom mission automatically.

## 7. Audit trail packaging

1. Zip `demo/Meta-Agentic-Program-Synthesis-v0/reports/` or upload to IPFS.
2. Share `meta-agentic-program-synthesis-manifest.json` so auditors can verify SHA-256 hashes.
3. Provide `meta-agentic-program-synthesis-dashboard.html` for the executive UI and `meta-agentic-program-synthesis-full.md` for a
   printable dossier.

With this runbook, a single steward can rehearse the entire sovereign program synthesis lifecycle – from spawning evolutionary
agents to asserting CI parity and owner supremacy – without touching TypeScript or Solidity.
