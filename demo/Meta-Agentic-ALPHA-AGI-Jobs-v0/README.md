# Meta-Agentic ALPHA AGI Jobs

**Turn specialized intelligence into useful, reviewable work.** This complete demo collection connects Identify → Out-Learn → Out-Think → Out-Design → Out-Strategise → Out-Execute to explicit scope, worker qualification, reviewer capacity and USDC work-order planning.

AGI Jobs is a scalable machine labor layer for authorized, lawful screen-based work: specialized agents execute scoped tasks, produce reviewable evidence, and support independent verification and settlement. The long-term ambition is to turn accepted digital work into productive resources for science, engineering, energy and eventually Kardashev Type II infrastructure. Physical realization remains a separate engineering and institutional undertaking.

[Open the live workbench](https://montrealai.github.io/AGIJobsv0/experiments/meta-agentic-alpha/) · [Operator runbook](RUNBOOK.md) · [Validation and boundaries](VALIDATION.md)

## Start here

From the repository root, use the Node version in `.nvmrc`:

```bash
npm run demo:meta-agentic-alpha:work
```

This dependency-free command executes six analyses, independently checks their results, and writes a new `reports/meta-agentic-alpha/<run-id>/` directory. It never overwrites an existing run. Inspect `report.md`, the six JSON artifacts, six task contracts, `scenario.json`, `review.json` and the final `evidence.json` completion marker.

For the complete local website and every preserved dashboard:

```bash
npm ci
npm run demo:meta-agentic-alpha:serve
```

Open **http://127.0.0.1:4191/**. The viewer builds into a disposable directory, listens only on loopback, serves an explicit public asset list, and stops with Ctrl+C. It has no dispatch, signing or payment endpoint. Browser calculations and imports stay local; no credentials are requested.

## The six-phase delivery loop

| Phase | Actual computation | Artifact |
| --- | --- | --- |
| Identify | Inventory twelve substantial proposed projects and reconcile reward/review demand | `inventory.json` |
| Out-Learn | Qualify workers against minimum observations and useful-result thresholds | `qualification.json` |
| Out-Think | Select the best qualified matching specialist, with stable tie-breaking | `routing.json` |
| Out-Design | Preserve deliverables, acceptance criteria, exact rewards and review pools | `contracts.json` |
| Out-Strategise | Reserve reward budget and matching reviewer minutes in source order | `admission.json` |
| Out-Execute | Materialize the admitted work orders and reconcile the complete dossier | `delivery-dossier.json` |

The reference source produces **five review-ready work orders, seven deferred briefs, 23,000 USDC reserved, and 7,000 USDC unallocated including the 5,000 USDC minimum reserve**. The design worker fails the configured qualification threshold. Software and research reviewer time are fully allocated. This is a deterministic evaluation, not an optimized packing algorithm.

The twelve briefs cover complete applications, SDK migrations, performance repairs, numerical research, evaluation suites, interface design, supply-chain models, open-source features, executable documentation, evidence maps, reconciliation software and scientific exploration. They are **proposed customer projects**. The completed artifacts are the six portfolio analyses and work-order dossier; the demo does not claim those customer projects have been delivered.

## Evidence that can be challenged

The independent reviewer derives answers with its own implementation. It checks source identity, exact task digests, phase dependencies, complete coverage, artifact names, media types, UTF-8 byte counts, hashes and semantics. Try **Test a rehashed wrong answer**: an incorrect answer remains rejected after its hash is repaired.

```bash
npm run demo:meta-agentic-alpha:review -- reports/meta-agentic-alpha/RUN_ID/evidence.json
npm run demo:meta-agentic-alpha:task -- think
node demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/workbench/cli.mjs inspect think
```

For provider receipts, supply the expected job ID and deployment identity from a protected admission record. An unsigned receipt's claim to be “live” is not execution provenance. A successful artifact check is not independent human acceptance or settlement authorization. `productionApproved` and `settlementApproved` remain false.

## Current computer-work integration

The task contracts use the repository's existing `ComputerWorkTask` and admitted OpenClaw Responses adapter. A protected worker profile must admit the **exact task digest and job ID**, identify the deployment, and name the bearer-token environment variable. The example profile has an empty admission list. The persistent journal rejects replay and blocks automatic retries when the outcome is unknown.

OpenClaw can expose browser, file, shell and computer tools according to its installed provider, local permissions and tool policy. ChatGPT Work can execute an operator-led scoped session and return candidate files for review. They are separate execution surfaces: this demo does not invent a remote Work API or assume a model credential grants desktop access. See the [commissioning procedure](RUNBOOK.md#connected-worker).

## Scale and the long horizon

The website's capacity model is limited by useful worker output, independent reviewer time and an explicitly assumed market ceiling. Zero reviewer capacity means zero accepted volume. The **USD 40 trillion/year market ceiling and USD 40 billion/year milestone are scenario assumptions**, not measured TAM, revenue forecasts or demonstrated throughput. The calculator assumes 365 operating days and USD 1 per USDC; costs, customer acquisition, disputes and recovery are not modeled.

Reliable accepted work can support reinvestment in better software, scientific tools, compute and energy research. Scaling depends on observed delivery quality, review capacity, demand and accountable capital allocation; no simulated score establishes superintelligence or physical infrastructure capability.

## Every original demonstration is preserved

The live and local workbench includes thirteen original views: the classic TypeScript portfolio, Prime, V1 orchestration and V2–V11 consoles. Their diagrams remain visible, with reserved punctuation normalized only for rendering. Mermaid and HTML sanitization are bundled from locked dependencies; no third-party CDN is needed at runtime.

| Entry point | Purpose | Guide |
| --- | --- | --- |
| `npm run demo:meta-agentic-alpha` | Original TypeScript scenario projection; retained command and reports | [Scenario](scenario/baseline.json) |
| `meta_agentic_demo.py` | V1 orchestration rehearsal | [Original configuration](config/meta_agentic_scenario.yaml) |
| `meta_agentic_demo_v2.py` … `meta_agentic_demo_v11.py` | Preserved progressively expanded mission models | Variant README files |
| `meta_agentic_alpha_prime_demo/run_prime_demo.py` | Prime signal-to-strategy simulation | [Prime guide](meta_agentic_alpha_prime_demo/README.md) |

Original scenarios include illustrative addresses, AGIALPHA units, example operator secrets, configured CI statuses, owner command strings and historical projections. They are fixtures, not operational credentials, deployment records, current CI evidence or commands to execute blindly. USDC work-order accounting is separate.

Run all twelve Python CLIs without modifying tracked examples:

```bash
python -m pip install -r requirements-python.txt
python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/rehearse.py --out reports/meta-agentic-alpha/python-RUN_ID
```

Choose a new output path. This runs each CLI in its own subprocess within a disposable copy and excludes inherited provider/admission credentials. It retains logs, snapshot data and a rehearsal manifest. `legacy/snapshots.json` contains recorded synthetic outputs used by the preserved website views; it is not live telemetry.

## Original systems map

```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_Meta_Agentic_ALPHA_AGI_Jobs_v0[[Demo → Meta Agentic ALPHA AGI Jobs v0]]
    demo_Meta_Agentic_ALPHA_AGI_Jobs_v0 --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Verification

```bash
npm run test:meta-agentic-alpha
npm run demo:meta-agentic-alpha:test
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/tests -q
npm run demo:meta-agentic-alpha:qa
npm run site:build
npm run site:test
```

The dedicated CI workflow runs the Python suite, every Python CLI, TypeScript regression tests, admitted adapter fixtures and browser checks. Pages publication additionally verifies the integrated site. See [VALIDATION.md](VALIDATION.md) for what these checks establish and the remaining live commissioning boundary.
