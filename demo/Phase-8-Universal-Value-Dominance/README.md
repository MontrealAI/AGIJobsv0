# Phase 8 — Universal Value Work Lab

**Design useful machine work, reserve its cost, and make every outcome reviewable.**
Phase 8 combines a browser work lab with the preserved universal-value governance atlas, multi-agent UI, Mermaid diagrams, and command-line artifact generators.

AGI Jobs is designed as a scalable machine labor layer for authorized, lawful screen-based work: specialized workers execute scoped tasks, produce evidence, and support separate verification, buyer acceptance and settlement. Broad computer-use capability expands the kinds of work that can be attempted; it does not guarantee every job can be completed reliably.

[Open the work lab](https://montrealai.github.io/AGIJobsv0/experiments/phase8/workbench/) · [Open the governance atlas](https://montrealai.github.io/AGIJobsv0/experiments/phase8/) · [Integration and operating guide](OPERATING_GUIDE.md)

## Start in three minutes

The published work lab requires no installation, login, wallet, or payment.

1. Choose one of ten work categories and inspect deliverables and acceptance criteria.
2. Compare the balanced, review-bottleneck, and worker-interruption scenarios. Edit budgets, capacity and assumed success rates.
3. Download a scoped work-order draft, capacity plan or calculation report. No worker is dispatched by these downloads.

For reproducible local calculations (Node.js; no npm dependencies required):

```bash
npm run demo:phase8:work -- run /tmp/phase8-work
python3 demo/Phase-8-Universal-Value-Dominance/workbench/verify.py /tmp/phase8-work
```

Use a new output directory for each run. The bundle contains `plan.json`, ten `work-orders.json` drafts, `report.md`, and a SHA-256 `receipt.json`. The separate Python checker recomputes admission, reserves and costs. Hash checks detect artifact changes against the supplied receipt; they do not authenticate its author or prove reviewer independence.

For the complete site and governance console, use the repository's `.nvmrc` Node version and locked npm toolchain, then:

```bash
npm ci
npm run demo:phase8:orchestrate
npm run demo:phase8:ci
npm run demo:phase8:site
python3 -m http.server 18798 --bind 127.0.0.1 --directory build/phase8
```

Open `http://127.0.0.1:18798/workbench/`. The original atlas is at `/` and multi-agent view at `/ui/`. The build regenerates governance artifacts and serves Mermaid locally.

## What the evidence establishes

| Surface | Implemented behavior | Evidence boundary |
| --- | --- | --- |
| Work lab | Ten categories, capacity constraints, reserved budgets and exports | Scenario calculations; acceptance rate is an assumption |
| CLI and Python checker | Reproducible artifacts, digests and separately implemented arithmetic checks | Local execution; no outside reviewer identity verified |
| Governance atlas | Manifest validation, calldata proposals, scorecards, Mermaid and owner controls | Synthetic addresses, budgets, models and heuristics |
| Computer-work bridge | Calls the shared admitted worker harness for an exact job ID and task digest | Requires an operator-configured, authenticated endpoint and approved task |
| Production acceptance | Explicit criteria and commissioning procedure | Live runtime, unrelated review, buyer use and settlement remain to be demonstrated |

The $40 trillion/year screen-work opportunity is a **user-supplied strategic assumption**, not an independently established TAM, a revenue forecast, or a capacity measurement. Civilization-scale energy, compute and infrastructure coordination are long-term ambitions. The work lab starts with reproducible, bounded outcomes.

## Accounting rules

- Worker capacity assumes eight productive hours per day, reduced by the outage assumption.
- Every admitted attempt reserves its reward, execution cost and review cost. Review capacity covers all attempts, including those not accepted.
- Expected accepted jobs are rounded down. Only accepted work earns a modeled reward; other reward reserves are released in the scenario.
- Disputes, refund delays, chain fees, taxes, settlement finality and realized buyer value are outside this planning model.
- The legacy manifest's shared annual streams are divided equally across their unique active target domains. Budgets are no longer duplicated for every binding. Disabled entities do not contribute to active capacity.
- Python and TypeScript use the same manifest fields and seconds-based guardian window. The synthetic dominance score is a heuristic, not a production approval.

## Verification

```bash
npx jest --config demo/Phase-8-Universal-Value-Dominance/jest.config.cjs --runInBand
npm run demo:phase8:work:test
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest --noconftest demo/Phase-8-Universal-Value-Dominance/tests/test_run_demo_script.py demo/Phase-8-Universal-Value-Dominance/tests/test_manifest_structure.py
npm run demo:phase8:site
npx playwright install chromium
npm run demo:phase8:qa
```

Browser QA checks desktop, mobile and tablet layouts, ten categories, downloads, invalid inputs, bottlenecks, accessibility, and both preserved diagram views. Review [the operating guide](OPERATING_GUIDE.md) before connecting a live runtime.

---

## Preserved governance reference

The following original reference remains available alongside the work lab. Its model labels, addresses, scenario budgets and historical validation documents are fixtures unless independently commissioned.

### AGI Jobs v0 (v2) — Governance atlas reference

> A synthetic orchestration and governance scenario; see the evidence boundaries above.

## Overview
- **Path:** `demo/Phase-8-Universal-Value-Dominance/README.md`
- **Module Focus:** Anchors Demo → Phase 8 Universal Value Dominance inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Quickstart
1. From the repository root, run `npm ci` once to hydrate all workspaces.
2. Regenerate the Phase 8 outputs with `npm run demo:phase8:orchestrate` when manifest data changes.
3. Validate the manifest and exported artifacts with `npm run demo:phase8:ci`.

### Exported artifacts
- `phase8-governance-calldata.json`
- `phase8-safe-transaction-batch.json`
- `phase8-telemetry-report.md`
- `phase8-mermaid-diagram.mmd`
- `phase8-orchestration-report.txt`
- `phase8-governance-directives.md`
- `phase8-governance-checklist.md`
- `phase8-self-improvement-plan.json`
- `phase8-cycle-report.csv`
- `phase8-dominance-scorecard.json`
- `phase8-emergency-overrides.json`
- `phase8-guardian-response-playbook.md`

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/Phase-8-Universal-Value-Dominance` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Mermaid
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_Phase_8_Universal_Value_Dominance[[Demo → Phase 8 Universal Value Dominance]]
    demo_Phase_8_Universal_Value_Dominance --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Smart contract
- Governance execution manifests live in `phase8-governance-calldata.json` and `phase8-safe-transaction-batch.json`.
- Emergency pause/resume actions are packaged in `phase8-emergency-overrides.json` for guardian use.

## Self-improvement
- The adaptive roadmap and cadence targets are documented in `phase8-self-improvement-plan.json`.
- Use `phase8-cycle-report.csv` alongside `phase8-dominance-scorecard.json` to track iteration quality and resilience scores.

## Working With This Module
1. From the repository root run `npm ci` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/Phase-8-Universal-Value-Dominance`.
3. Execute `npm test` and `npm run lint --if-present` before pushing to check the relevant AGI Jobs v0 (v2) CI signal.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../OperatorRunbook.md).

## Directory Guide
### Key Directories
- `assets`
- `config`
- `configs`
- `output`
- `scripts`
- `tests`
- `ui`
### Key Files
- `index.html`
- `jest.config.cjs`
- `phase8-validation-2025-10-24.md`
- `playbook.md`
- `playwright.config.ts`
- `tsconfig.test.json`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.

## Testing & Playwright Browsers

- Before running `npx playwright test --config=playwright.config.ts`, you can provision the bundled Chromium binary once with:
  - `./scripts/install_playwright_browsers.sh`
- The suite includes a lightweight global setup that will automatically download Chromium if it is missing and has the privileges to install its OS-level dependencies. E2E checks are enforced by default in CI; locally you can opt out by setting `PLAYWRIGHT_OPTIONAL_E2E=1` or force a hard failure with `PLAYWRIGHT_OPTIONAL_E2E=0` when the browser cannot be installed.
- System dependency installation (`playwright install --with-deps`) defaults to **on in CI** and **off locally** to avoid surprise `apt` prompts. If your first local run is missing the required X/GTK/font packages, set `PLAYWRIGHT_INSTALL_WITH_DEPS=1` (or run the install script above) to bootstrap them explicitly.
- Both paths install the OS-level dependencies Playwright needs so the dashboard e2e suite runs without manual intervention on fresh machines when permission is available.
- Expect the first run to download browser artefacts and, when allowed, apt packages (fonts, headless display libraries). Subsequent runs reuse the cached binaries under `~/.cache/ms-playwright`, so reruns stay fast without additional flags.
