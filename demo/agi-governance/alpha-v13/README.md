# 🎖️ Solving α-AGI Governance — α-field v13 Mission Pack

This mission pack instantiates the mathematical programme outlined in `alpha_asi_governance_v13.tex` directly on top of **AGI Jobs v0 (v2)**. A non-technical owner can run a single command and watch the platform generate, validate, and certify a civilisation-scale governance dossier that fuses Hamiltonian thermodynamics, antifragile game theory, and Ethereum-grade owner controls.

The pack is intentionally batteries-included:

- **Mission manifest** – `config/mission@v13.json` encodes thermodynamic constants, Gibbs envelopes, stake-aware incentives, antifragility curvature, and CI guard rails from the α-field proofs.
- **Physics-grade dossier** – `scripts/runMission.ts` calls the production `generateGovernanceDemo` engine with v13 parameters, emitting Markdown, JSON, and a cinematic dashboard full of mermaid diagrams, alpha-field heatmaps, and owner capability matrices.
- **Triple validation** – independent recomputation (`scripts/validateMission.ts`), CI shield auditing (`scripts/verifyCi.ts`), and owner diagnostic sweeps (`scripts/ownerDiagnostics.ts`) cross-check the dossier and record provenance in `reports/`.
- **Full pipeline** – `scripts/fullPipeline.ts` stitches everything together so a board member can trigger the entire α-field drill and archive one aggregated JSON/Markdown bundle.

## Quickstart

```bash
npm run demo:agi-governance:alpha-v13
```

The command loads the v13 manifest, runs the Hamiltonian/statistical-physics stack, computes equilibrium by five independent methods, verifies Jarzynski equality versus the Landauer bound, and renders the α-field governance atlas. Outputs land in `demo/agi-governance/alpha-v13/reports/`:

- `governance-demo-report-v13.md`
- `governance-demo-summary-v13.json`
- `governance-demo-dashboard-v13.html`

## Deep validation

| Purpose | Command | Output |
| --- | --- | --- |
| Recompute all physics, equilibrium, and incentives | `npm run demo:agi-governance:alpha-v13:validate` | `reports/governance-demo-validation-v13.{json,md}` |
| Confirm the CI (v2) enforcement shield | `npm run demo:agi-governance:alpha-v13:ci` | `reports/ci-verification-v13.json` |
| Aggregate owner diagnostics (Hamiltonian audit, reward engine, upgrades, compliance) | `npm run demo:agi-governance:alpha-v13:owner-diagnostics` | `reports/owner-diagnostics-v13.{json,md}` |
| Execute the entire α-field drill (generate → validate → CI → owner diagnostics) | `npm run demo:agi-governance:alpha-v13:full` | `reports/governance-demo-full-run-v13.{json,md}` |

Every artefact is deterministic, timestamped, and ready for regulator packets or board reviews.

## Why this empowers non-technical owners

- **Physics without calculus** – all Hamiltonian, Gibbs, Landauer, and Jarzynski calculations are performed in code and summarised in plain language with callouts for any deviations beyond tolerance.
- **Antifragility visualised** – the dossier includes mermaid mindmaps, antifragility SVG charts, and α-field confidence dashboards so stakeholders see how shocks increase welfare.
- **Owner absolutism** – the manifest inventories every pause/resume/parameter/treasury/sentinel/upgrade/compliance command, checks the corresponding npm scripts exist, and reports readiness percentages.
- **Ethereum mainnet ready** – the manifest assumes mainnet-level RPC infrastructure, timelocks, Safe modules, and pausable selectors. No toy addresses or short-cuts.
- **CI enforcement guaranteed** – the CI verification step ensures the root `ci (v2)` workflow still runs lint, tests, Foundry, coverage, and summary jobs with concurrency guards on PRs and `main`.

## File map

```
alpha-v13/
├── config/
│   └── mission@v13.json          # α-field governance manifest
├── reports/                      # Generated artefacts (kept out of git via .gitkeep)
├── scripts/
│   ├── fullPipeline.ts           # Orchestrates the entire drill
│   ├── ownerDiagnostics.ts       # Owner capability & readiness audit
│   ├── runMission.ts             # Generates the governance dossier
│   ├── validateMission.ts        # Independent recomputation & consistency checks
│   └── verifyCi.ts               # Ensures the v2 CI shield remains enforced
└── tsconfig.json                 # TypeScript config extending the parent demo settings
```

## Next steps

1. Review the generated Markdown dossier and dashboard to align stakeholders on energy margins, antifragility curvature, and Stackelberg bounds.
2. Attach `governance-demo-validation-v13.md`, `ci-verification-v13.json`, and `owner-diagnostics-v13.md` to governance packets as evidence that the α-field machine is locked to owner control.
3. When ready for on-chain execution, follow `RUNBOOK.md` for a guided deployment using AGI Jobs v0 (v2) scripts, Safe batch transactions, or Etherscan calls.

> **Confidence:** This mission pack proves that AGI Jobs v0 (v2) lets a non-technical owner conjure a thermodynamically grounded, antifragile, Ethereum-ready governance machine — exactly the superintelligent leverage promised by the α-field research.
