# α-AGI MARK — capital for verifiable machine work

**Explore:** [Capital-to-work lab](https://montrealai.github.io/AGIJobsv0/experiments/alpha-agi-mark/) · [Guided tour](https://montrealai.github.io/AGIJobsv0/demos/alpha-agi-mark/) · [AGI Jobs Observatory](https://montrealai.github.io/AGIJobsv0/).

α-AGI MARK demonstrates a governed capital-allocation lifecycle: issue a project seed, price participation on a bonding curve, collect validator decisions, exercise owner stop controls and transfer approved reserves to a sovereign vault. The broader purpose is to direct resources toward authorized computer-based work with measurable deliverables and independent acceptance.

**What works here:** executable Solidity contracts, local-chain scenarios, adversarial tests, ledger replay, seeded stress checks, and reviewable reports. The website adds a browser-only work-planning lab. **What this does not establish:** an audited production deployment, live provider commissioning, independent buyer acceptance or paid job settlement. A passing arithmetic check is not a prediction of investment returns or proof of superintelligence.

## Start in three steps

Use the exact Node version in the root `.nvmrc` and the repository lockfile. Run from the repository root:

```bash
npm ci
npm run test:alpha-agi-mark
npm run demo:alpha-agi-mark:full
```

The default execution uses an ephemeral Hardhat chain and disposable test accounts. It needs no wallet, provider account or real funds. Clear external network/key overrides before local work. The full suite stops if a command fails; never treat an old report left on disk as a fresh success.

Open `demo/alpha-agi-mark/reports/alpha-mark-dashboard.html` and inspect `alpha-mark-recap.json`. The dashboard retains the existing Mermaid diagrams. The public lab bundles its own diagram runtime; the standalone generated dashboard may need network access for its Mermaid runtime.

| Goal | Command / destination |
| --- | --- |
| Run the contract tests | `npm run test:alpha-agi-mark` |
| Test malformed evidence and failure handling | `npm run test:alpha-agi-mark:scripts` |
| Run only the local-chain scenario | `npm run demo:alpha-agi-mark:ci` |
| Recompute accounting from the recap | `npm run verify:alpha-agi-mark` |
| Repeat the seeded stress checks | `npm run verify:alpha-agi-mark:stochastic` |
| Generate all operational reports | `npm run demo:alpha-agi-mark:full` |
| Explore the existing operator console | `npm run console:alpha-agi-mark -- --snapshot` |
| Prepare actual computer work | [Computer-work handoff](docs/computer-work-handoff.md) |

## What the system demonstrates

- **NovaSeedNFT:** a project seed and its metadata provenance.
- **AlphaMarkEToken:** bounded supply, bonding-curve purchases/redemptions, reserve accounting, allowlists, pause/abort controls and launch finalization.
- **AlphaMarkRiskOracle:** an owner-configured validator set, threshold approvals and explicit governance override.
- **AlphaSovereignVault:** launch receipt metadata and asset-specific intake accounting.
- **Evidence:** a trade ledger, participant balances, reserve reconciliation, local validator votes and reproducible verification. Checks sharing one recap are independent calculations, not independent organizations or attestations.

The historical financing market supports native assets and configured ERC-20 tokens. It is **separate from a USDC-denominated AGI Jobs work proposal**. Neither a market launch nor a browser export pays a worker, mints a job identity, submits a marketplace job or authorizes a transaction. Do not add amounts with different asset units; use `totalReceivedNative()` and `totalReceivedToken(asset)` rather than the legacy raw-unit sum. Fee-on-transfer and rebasing assets are unsupported. Clients should prefer `buyTokensWithLimit` / `sellTokensWithLimit` to bound execution prices; the original entry points remain available for compatibility.

## From useful work to civilization-scale capacity

AGI Jobs is designed as a scalable machine labor layer for authorized, lawful screen-based work: specialized agents execute tasks, produce reviewable evidence and support independent verification and settlement. Start with public software, dataset analysis, research, editable reports, spreadsheets, presentations and application QA. Expand only as measured acceptance, cost, reviewer capacity and recovery performance justify it.

The project's **$40 trillion/year** screen-work opportunity is an explicit planning assumption, not a verified market estimate, captured revenue or a claim that every human task can already be automated. The practical path is repeated useful work, controlled reinvestment and infrastructure that can be independently inspected.

OpenClaw can provide an isolated browser and configured model/tools; ChatGPT Work offers its own computer-use experience. These are distinct execution surfaces, with availability and permissions to verify. Follow the [current integration map and source references](docs/computer-work-handoff.md); no live Work API bridge is implied by this demo.

## Preserved systems map

```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_alpha_agi_mark[[Demo → Alpha AGI Mark]]
    demo_alpha_agi_mark --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Operator and engineering guides

- [Complete runbook](runbooks/alpha-agi-mark-runbook.md) and [original architecture flow](runbooks/alpha-agi-mark-flow.mmd).
- [Operator command console](docs/operator-command-console.md), [empowerment atlas](docs/operator-empowerment-atlas.md), and [verification compendium](docs/operator-verification-compendium.md).
- [Computer-work commissioning](../../docs/computer-work.md), [evidence review](../../docs/EVIDENCE_REVIEW.md), and [repository production gates](../../docs/production/readiness.md).

`contracts/` and `test/` contain the financial mechanism and its tests; `scripts/` contains execution and verification; `reports/` contains recorded examples, not live service status. Historical reports and all existing diagrams are retained. Regenerate a complete report set from the current source before review.

## Production acceptance

Before any funded deployment, obtain an independent contract review, use reviewed immutable asset behavior and network configuration, provision separate operator/worker/reviewer identities, test pause and recovery procedures, record live provider evidence and actual buyer acceptance, and verify the intended settlement contract/token. Owner override is a governance power, not independent validation. Keep signing credentials outside tasks, browser pages and repository files.

All changes pass through a reviewed pull request. The focused workflow tests contracts, rejects corrupted evidence, executes the local suite and archives its reports; the Pages workflow tests navigation, responsive layouts, accessibility and diagrams before publication. Those checks certify their stated scope only.
