# Alpha-Meta Owner Runbook

This runbook guides a non-technical owner through the alpha-meta omnidominion rehearsal. Every step uses production scripts that ship with AGI Jobs v0 (v2).

## 0. Prerequisites

- Node.js 18+
- Docker (for optional dashboards)
- `npm install` already executed in the repository
- Terminal connected to `anvil` or another Ethereum endpoint exposed at `http://127.0.0.1:8545`

## 1. Launch the meta-orchestrator

```bash
./demo/alpha-meta/bin/launch.sh
```

What happens automatically:

1. `demo/agi-governance` orchestrator runs with `config/mission.alpha-meta.json`.
2. Thermodynamic, game-theoretic, antifragility, risk, and quantum calculations execute across five independent solvers.
3. Validation script recomputes the dossier results from scratch.
4. CI guard auditor confirms the repository still enforces lint, tests, Foundry, coverage, and summary jobs.
5. Owner automation doctor executes the Hamiltonian, reward-engine, upgrade-status, and compliance scripts to ensure the owner key controls everything.

Expect output similar to:

```
🎖️  META-AGENTIC α-FIELD :: OMNIDOMINION RUN
Owner Supremacy
  • Index: 99.XX%
  • Full coverage: yes
...
✅ Alpha-meta orchestration complete. Superintelligent labour field is primed under owner command.
```

## 2. Review artefacts

All artefacts land in `demo/alpha-meta/reports/alpha-meta/`.

| File | Purpose |
| --- | --- |
| `alpha-meta-governance-report.md` | Natural-language mission dossier with embedded Mermaid diagrams. |
| `alpha-meta-dashboard.html` | Executive-ready dashboard, render in any browser. |
| `alpha-meta-summary.json` | Machine-readable metrics for automation. |
| `alpha-meta-owner-diagnostics.*` | Aggregated owner automation outputs. |
| `alpha-meta-ci.json` | Proof CI v2 guardrails are intact. |
| `alpha-meta-validation.*` | Independent recomputation of physics + equilibrium. |

## 3. Exercise owner supremacy

Copy and paste the commands provided inside the dossier / owner matrix:

```bash
HARDHAT_NETWORK=localhost npm run owner:system-pause -- --pause true
HARDHAT_NETWORK=localhost npm run owner:system-pause -- --pause false
HARDHAT_NETWORK=localhost npm run thermostat:update -- --target 318
HARDHAT_NETWORK=localhost npm run reward-engine:update -- --burn-bps 520 --treasury-bps 260
HARDHAT_NETWORK=localhost npm run owner:rotate -- --role Sentinel --count 5
```

Each command executes against the contracts deployed locally (anvil default address `0xf39f...`). Observe:

- Jobs halt during the pause state.
- Thermostat and reward parameters update instantly.
- Sentinel rotation emits events verifying control over guardian roster.

## 4. Dashboards (optional but cinematic)

```bash
# Terminal 1
docker compose up validator-ui enterprise-portal

# Terminal 2
npm --prefix apps/console run dev
```

Visit:

- http://localhost:5173 – Owner Console (pause/unpause switches, treasury sliders)
- http://localhost:3000 – Validator Dashboard (commit/reveal flows)
- http://localhost:3001 – Enterprise Portal (job creation wizard)

## 5. CI v2 verification loop

Before pushing changes, mirror the pipeline locally:

```bash
npm run lint:check
npm test
npm run coverage:check
npm run owner:verify-control
npm run ci:verify-branch-protection
```

All commands must succeed to maintain the fully green CI badge.

## 6. Archive evidence

- Commit artefacts to an evidence vault or upload to IPFS.
- Record SHA-256 hashes (already printed inside the dossier).
- Share the Markdown + JSON bundle with auditors; repeat runs remain deterministic thanks to the manifest.

## 7. Custom missions

To experiment with alternative thermodynamics or actor coalitions:

1. Copy `config/mission.alpha-meta.json` to a new file.
2. Adjust values (e.g., `thermodynamics.operatingTemperatureK`, `gameTheory.payoffMatrix`).
3. Re-run: `npm run demo:alpha-meta -- --mission ./my-new-mission.json --report-dir ./reports/my-mission`
4. Review outputs as above.

The orchestrator always enforces owner supremacy and CI parity regardless of manifest changes.
