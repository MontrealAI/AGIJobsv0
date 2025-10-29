# OMNI Open-Endedness Demo (AGI Jobs v0 / v2)

> **Purpose**: empower non-technical operators to orchestrate a
> production-ready OMNI curriculum that compounds economic value for the
> AGI Jobs platform.

## Why this matters

This demonstration shows how AGI Jobs v0 (v2) can bootstrap an
open-ended curriculum that continuously discovers high-ROI micro
interventions.  It packages every component a business operator needs:

- **Economic intelligence** – track GMV, ROI, and foundation-model spend.
- **Curriculum autonomy** – OMNI-style double-EMA learning progress with
  a human-notion-of-interestingness filter.
- **Instant execution** – run from the command line, notebooks, or the
  included dashboard without writing new code.

## Architecture Overview

```mermaid
graph TD
    A[Business Operator] -->|Configures seed YAML| B[AGI Jobs Control Plane]
    B -->|Spins up simulation/demo| C[OMNI Demo Engine]
    C --> D[Learning Progress Meter]
    C --> E[Model of Interestingness]
    C --> I[Thermostat Controller]
    C --> J[Sentinel Suite]
    D -->|probabilities| F[Task Sampler]
    E -->|Interesting/Boring tags| F
    I -->|Param updates| C
    J -->|Task enable/disable| F
    F -->|Curriculum| G[Agent Simulation]
    G -->|Outcomes| H[Economic Ledger]
    H -->|GMV/ROI dashboards| A
    J -->|Budget & ROI guardrails| A
    I -->|Spend telemetry| A
    G -->|Mastery signals| E
```

### Thermostat, Sentinels, and Owner Control loop

```mermaid
sequenceDiagram
    participant Owner
    participant Orchestrator
    participant Thermostat
    participant Sentinel
    participant Ledger

    Owner->>Orchestrator: Adjust config / pause window
    Orchestrator->>Ledger: Record attempt & costs
    Orchestrator->>Thermostat: Forward ROI snapshot
    Thermostat-->>Orchestrator: Tune weights / exploration
    Orchestrator->>Sentinel: Request FM refresh permission
    Sentinel->>Ledger: Inspect per-task ROI
    Sentinel-->>Orchestrator: Approve / deny + disable tasks
    Ledger-->>Owner: Surfaced via dashboard + JSON artefacts
```

## Quickstart (non-technical operator friendly)

1. Ensure Python 3.10+ is available.
2. From the repository root:

   ```bash
   cd demo/Open-Endedness-v0
   python omni_demo.py --steps 1000 --output results/latest.json
   ```

3. Open `web/index.html` in a browser to explore interactive charts based
   on the generated JSON payload.

The simulator prints a comparison table contrasting Uniform, LP-only,
and OMNI curricula.  The JSON artifact feeds the dashboard or any BI
pipeline.

### Optional: live foundation model evaluation

Set `AGIJOBS_OPENAI_API_KEY` and install `openai>=1.0` to dispatch
real-time prompts.  The simulator automatically upgrades the MoI client
from the heuristic fallback to GPT-4 based judgments when the package
and key are available.

## Configuring scenarios

Edit `omni_config.yaml` to tweak:

- Task libraries and ROI assumptions.
- Thermostat controls (FM budget, ROI floors, exploration weights).
- Sentinel guardrails (entropy limits, QPS caps, etc.).

No code changes required: the CLI reads the YAML and applies overrides at
runtime.

## Included assets

| Path | Description |
| ---- | ----------- |
| `omni_demo.py` | High-fidelity OMNI simulator + CLI. |
| `prompts/interestingness_prompt.md` | Production-ready prompt template. |
| `omni_config.yaml` | Seed configuration with ROI, thermostat, sentinel & owner control guardrails. |
| `web/index.html` | Browser dashboard with Chart.js visualisations and live event stream. |
| `web/main.js` | Client logic rendering ROI, spend, allocation and guardrail signals. |
| `results/latest.json` | Generated metrics snapshot (updated via CLI). |
| `tests/test_probabilities.py` | Regression tests validating LP maths. |
| `tests/test_controls.py` | Coverage for thermostat, sentinel, and ledger governance. |

### Intelligent guardrails for non-technical owners

```mermaid
graph LR
    OwnerConsole[Owner Controls\\npause_windows & weight schedule] -->|Overrides| Engine[OMNI Engine]
    Engine --> Thermostat
    Engine --> Sentinel
    Thermostat -->|Auto tuning| Engine
    Sentinel -->|ROI floor & QPS| Engine
    Sentinel --> Ledger
    Ledger --> Dashboard[Dashboard & JSON Ledger]
    Dashboard --> OwnerConsole
```

**Owner levers surfaced in config:**

| Control | Purpose | Example |
| ------- | ------- | ------- |
| `pause_windows` | Temporarily halt task execution without code edits. | Pause steps 320-340 to align with treasury maintenance. |
| `weight_schedule` | Deterministically retune OMNI weights mid-run. | Increase `interesting_weight` at step 450 after validating ROI. |
| `manual_overrides` | Force-enable/disable tasks via Sentinel without editing the engine. | Keep a compliance-critical task active regardless of MoI verdict. |

Thermostat rules keep FM spend productive and diversify allocations whenever entropy collapses. Sentinel rules hard-stop ROI-negative tasks, throttle FM cadence, and enforce budget ceilings so the demo remains safe even in aggressive exploration regimes.

## Dashboard preview

```mermaid
graph LR
    data[results/latest.json] --> chart1[GMV Trajectory]
    data --> chart2[Task Allocation Heatmap]
    data --> chart3[ROI Delta vs Baselines]
    chart1 --> ops[Executive Briefing]
    chart2 --> ops
    chart3 --> ops
```

The static HTML dashboard consumes JSON via Fetch API.  Deploy on any
static host (S3, IPFS, or AGI Jobs web tier) for instant stakeholder
access.

### Live guardrail telemetry

- **Spend Profile chart** – stacked bars showing operational vs FM spend per strategy.
- **Return Profiles chart** – dual lines for total ROI and ROI on FM expenditure.
- **Event stream** – thermostat, sentinel, and owner interventions rendered as a chronological playbook so executives can audit every automated decision.

## Business interpretation

- **OMNI** consistently concentrates on task families that unlock new
  monetisation channels, avoiding diminishing-return iterations.
- **Learning Progress only** improves execution efficiency but can still
  get stuck polishing solved problems.
- **Uniform** wastes budget on both trivial and impossible tasks.

> The consequence: OMNI reaches production-grade GMV in a fraction of
> the task budget while obeying strict ROI and foundation-model limits.

## Next steps

1. Plug results into the AGI Jobs orchestrator via the documented API
   contracts.
2. Swap the heuristic MoI mode for GPT-4 once credentials are provisioned.
3. Run the included notebook (coming soon) to benchmark against live
   marketplace cohorts.

## CI v2 alignment

The demo inherits AGI Jobs v0 (v2)'s **CI v2** discipline. Run `npm run ci:verify-branch-protection` or the root `make ci` target to confirm branch protection gates stay green. Unit coverage for the demo (`pytest demo/Open-Endedness-v0/tests`) is intended to be wired into the existing GitHub Actions surfaces so every OMNI upgrade publishes artefacts with full telemetry.

This demo is self-contained, deterministic, and upgrade-safe.  It can be
used during investor demos, stakeholder briefings, or internal training
sessions to illustrate how AGI Jobs v0 (v2) delivers compounding economic
leverage.
