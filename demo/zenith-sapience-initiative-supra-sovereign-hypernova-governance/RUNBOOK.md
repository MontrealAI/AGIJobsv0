# Hypernova Mission Runbook

Run commands from the repository root using Node **22.23.3** (`.nvmrc`). Choose the path matching the evidence you need. Browser/CLI analysis is self-contained; contract rehearsals additionally need the locked root dependencies (`npm ci`). Foundry is optional: the local driver can start Hardhat instead.

## 1. Browser and offline analysis

```bash
npm run demo:zenith-hypernova:serve
```

Open <http://127.0.0.1:4178>. The server binds only to loopback and serves an explicit asset allowlist. Use `PORT=4179` if needed; stop with Ctrl+C. The hosted [workbench](https://montrealai.github.io/AGIJobsv0/experiments/zenith-hypernova/) runs the same analysis without a local server.

```bash
npm run demo:zenith-hypernova:work -- --out reports/hypernova-analysis-001
npm run demo:zenith-hypernova:review -- --source reports/hypernova-analysis-001/source-plan.json --evidence reports/hypernova-analysis-001/evidence.json
```

The new output directory contains `source-plan.json`, `analysis.json`, `allocations.csv`, `report.md`, `evidence.json` and `review.json`. Omit `--out` for a timestamped directory. Existing destinations are rejected. Review exits 0 for valid content, 2 for rejected evidence, and 1 for command or file errors.

The checker verifies source bytes, artifact bytes, independently recalculated budgets and timing, and consistency of all exports. An internally consistent report can correctly identify an invalid plan; passing content checks does not mean the plan is feasible or production commissioned.

To reproduce the historical defects:

```bash
npm run demo:zenith-hypernova:work -- --source demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/fixtures/legacy-project-plan.json
```

## 2. Work proposal and runtime handoff

```bash
npm run demo:zenith-hypernova:task -- --type governance-audit --region EARTH --budget 1500 --out reports/hypernova-task-001
```

Outputs: `work-order.json`, `handoff.md` and the exact `source-plan.json`. There are ten work types and six regional contexts, visible in the browser. JSON records a six-decimal USDC ceiling in integer base units, an unassigned reviewer, time limits and **no execution authority**. It is neither funded escrow nor a provider-spending limit.

Use [INTEGRATION.md](INTEGRATION.md) to authorize and operate a compatible runtime. Send only approved sources. Return artifacts, source citations, reproduction commands and action records. Assign an unrelated reviewer before acceptance. General task deliverables are not automatically accepted by the governance-analysis checker.

## 3. Preserved deterministic governance kit

```bash
npm run demo:zenith-hypernova
```

This wrapper selects the Hypernova plan, documents and report scope, then invokes `scripts/v2/asiGlobalDemo.ts`. It regenerates constants, compiles contracts, exercises the shared testnet dry-run, generates thermodynamic and owner-control reports, renders governance diagrams, checks wiring and assembles a SHA-256-indexed kit.

Inspect `reports/zenith-hypernova/summary.md`, `summary.json`, `governance.mmd`, `mission-control.md`, `parameter-matrix.md` and `zenith-hypernova-governance-kit.json`. The kit’s protocol checks do not execute the eleven infrastructure projects. The plan contains illustrative ENS handles and placeholder governance addresses, not attested deployments.

No arguments are accepted. `HARDHAT_NETWORK` must be unset or `hardhat`. Before a new run, existing reports are preserved in a sibling `zenith-hypernova-previous-*` directory. Symlinked output directories are rejected. Never place secrets in generated reports or upload private operator material.

## 4. Preserved isolated local-chain rehearsal

```bash
npm run demo:zenith-hypernova:local
# If the default port is occupied:
DEMO_PORT=18545 npm run demo:zenith-hypernova:local
```

The wrapper requires `NETWORK=localhost` (or unset), uses the shared `demo/asi-global/config/mission@v2.json`, and invokes the ASI Take-Off local driver. This driver compiles the production contract profile, starts its own loopback node, deploys local defaults, runs the Aurora job lifecycle, verifies receipts and stops only the node it started. It rejects remote RPC configuration through the shared preflight.

Inspect `reports/localhost/zenith-hypernova/receipts/`, the commissioning result and report. These are shared ASI Global mission receipts with mock local assets. Hypernova plan labels are not proof of construction, independent live buyer use, paid settlement or a USDC production deployment. Previous report directories are archived rather than deleted.

## 5. Owner controls and incident drills

The [owner matrix](OWNER-CONTROL.md) preserves every control category and corrects the old unsupported command flags. Run read-only planning against a configured deployment first. Ephemeral `hardhat` deployments do not persist between unrelated commands; addresses from one process are not a persistent network.

For local incident rehearsal, use the full deterministic kit and local lifecycle above, inspecting their scenario outcomes and logs. The old `disputes:sim` command is not registered in this repository and must not be used as evidence. Do not infer that a report generator pauses a system: an authorized contract action and a verified resulting state are required.

For an actual incident: stop new work, preserve the exact journal and outputs, have the authorized owner exercise the configured pause controls, verify state, reconcile uncertain external actions, correct the issue, and require fresh readiness checks before resuming. Model prompts are not access control.

## 6. Verification and publishing

```bash
npm run demo:zenith-hypernova:test
npx playwright install --with-deps chromium
npm run demo:zenith-hypernova:qa
```

Browser QA checks all ten proposals, analysis/CSV/report downloads, original defects, tampered and oversized evidence, source switches, capacity boundaries, keyboard access, responsive widths and accessibility. Screenshots and results go to `reports/pages/hypernova/`.

The Pages workflow also runs QA against the generated `build/pages/experiments/zenith-hypernova/` assets under a project-path prefix. It publishes only after checks succeed on `main`. The [validation record](VALIDATION.md) distinguishes local verification, CI and deployment-specific commissioning.
