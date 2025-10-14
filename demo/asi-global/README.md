# Global Autonomous Economic Orchestrator Demo

The **ASI Global Take-Off** demonstration drives the AGI Jobs v0 (v2) stack through a
planetary-scale coordination scenario.  It keeps every action inside the existing
contracts, scripts, and reporting pipelines while layering a global mandate on top of
the proven national take-off demo.

Key properties:

- **Deterministic artefacts.** Every step is executed via reproducible npm scripts so
the same plan, simulation, and owner verification bundle is produced every run.
- **Fully automatable.** The orchestrator performs plan → simulate → execute loops via
`scripts/v2/testnetDryRun.ts`, capturing job lifecycle telemetry for five regions and a
global audit finale.
- **Owner supremacy.** Governance controls (SystemPause, Thermostat, RewardEngine,
Quadratic Governor) are re-validated during the drill, and the output bundle documents
exactly how the owner can retune or pause the economy at any time.
- **Audit-grade evidence.** Mission Control, Command Center, Parameter Matrix, and
Mermaid diagrams are emitted to `reports/asi-global` with SHA-256 fingerprints.

Run the deterministic harness with:

```bash
npm run demo:asi-global
```

A local, interactive version that stands up a fresh Hardhat/Anvil network is available
via `npm run demo:asi-global:local` (see `RUNBOOK.md`).  The helper automatically lifts
block gas and code-size ceilings so the full protocol bundle deploys cleanly; override
them with `LOCAL_GAS_LIMIT` / `LOCAL_CODE_SIZE_LIMIT` if you want to stress-test other
limits.
