# Meta-Agentic α-AGI Jobs Demo 👁️✨

> **Mission:** Empower a non-technical owner to command an α-AGI grade wealth engine – entirely through AGI Jobs v0 (v2) – and watch it identify, design, govern, and execute trillion-scale opportunities autonomously.

This demo packages the full Meta-Agentic α-AGI Jobs experience into a one-click orchestration run. It demonstrates how a sovereign-scale operator can ingest multi-domain alpha signals, evolve world models, meta-plan, design execution blueprints, calibrate governance, and dispatch on-chain actions **without writing a single line of code**.

---

## 🎯 Capabilities at a Glance

- **Identify:** Multi-domain anomaly detection across finance, research, and policy data streams.
- **Out-Learn:** Self-evolving curriculum powered by POET-style simulation and MuZero-inspired world modeling.
- **Out-Think:** Meta-agentic tree search coordinating ≥5 specialised agents through the orchestrator runtime.
- **Out-Design:** Creative fusion agent drafts deliverables, dashboards, and antifragility playbooks.
- **Out-Strategise:** Treasury allocator balances capital across compound opportunities under policy guardrails.
- **Out-Execute:** Autonomous job posting, staking, validation simulation, and finalisation on AGI Jobs v0 (v2).

Every step is fully auditable, checkpointed, and reversible through built-in timelocks and guardian controls.

---

## 🧭 Directory Overview

```
demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/
├── README.md                     # You are here
├── meta_agentic_demo.py          # CLI entry point for the orchestration run
├── config/
│   └── meta_agentic_scenario.yaml # Narrative + plan definition
├── python/meta_agentic_alpha_demo/
│   ├── __init__.py               # Public API
│   └── engine.py                 # Execution harness
├── data/                         # Opportunity signal snapshots
├── reports/
│   └── alpha_deck.md             # Human-readable alpha deck (Mermaid-rich)
├── storage/ui/                   # Grandiose UI console (HTML/CSS/JS + Mermaid)
└── storage/                      # Runtime artefacts, scoreboard, checkpoints, latest run JSON
```

---

## 🚀 Quickstart (Non-Technical Friendly)

1. **Install prerequisites** (Python ≥3.11 recommended):
   ```bash
   pip install -r requirements-python.txt
   ```
2. **Run the orchestration**:
   ```bash
   python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_demo.py
   python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_demo_v2.py
   ```
   The V2 CLI prints direct links to the freshly generated owner console and masterplan report.
3. **Open the console**:
   ```bash
   python -m http.server --directory demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/storage/ui 9000
   ```
   Visit `http://localhost:9000` to explore the live dashboard. All metrics, tables, and Mermaid charts load directly from the latest orchestration JSON.
4. **Review the generated artefacts:**
   - `demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/storage/latest_run.json`
   - `demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/storage/latest_run_v2.json`
   - `demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v2/reports/generated/alpha_masterplan_run.md`
   - `demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/storage/orchestrator/scoreboard.json`
   - `demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/reports/alpha_deck.md`

> ✅ Everything ships pre-configured. The CLI auto-registers the validator agent, configures checkpoints, and ensures account-abstraction-ready governance parameters.

---

## ⚙️ Owner Controls (No-Code)

Adjust every mission-critical parameter using a single helper script:

```bash
python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/owner_controls.py \
  --config demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v2/config/scenario.yaml \
  --set plan.budget.max=550000 \
  --set phases[execute-onchain].step.params.job.reward=150000
```

- `--show` prints a JSON summary of the current governance posture.
- `--dry-run` previews the YAML change without writing to disk.
- List selectors such as `phases[execute-onchain]` or `agents[id=guardian-grid-validator]` target entries by identifier so owners never touch raw indexes.

All updates are idempotent, version-controlled, and reflected instantly in the UI and generated reports after the next run.

---

## 🧩 System Blueprint

```mermaid
graph LR
  A[Identify Mesh] --> B(Out-Learn Simulation Foundry)
  B --> C{Meta-Agentic Planner}
  C --> D[Creative Design Forge]
  D --> E[On-Chain Governance Core]
  E --> F[AGI Jobs Execution Engine]
  F --> G[Telemetry + Scoreboard]
  G --> A
```

```mermaid
sequenceDiagram
  participant Owner as Non-technical Owner
  participant Console as Meta-Agentic Console
  participant Orchestrator as AGI Jobs Orchestrator
  participant Governance as Governance Timelock
  participant Chain as Ethereum + AGI Jobs v0 (v2)
  Owner->>Console: Describe desired alpha outcome
  Console->>Orchestrator: Submit scenario YAML (zero code)
  Orchestrator->>Orchestrator: Restore checkpoints + register agents + spin meta-plan
  Orchestrator->>Governance: Calibrate parameters (stake floor, reward split, pause guardian)
  Governance-->>Orchestrator: Approvals recorded (2/2 guardians)
  Orchestrator->>Chain: Post job, stake validator, simulate commit
  Chain-->>Orchestrator: Emit receipts, scoreboard snapshot
  Orchestrator-->>Console: Update dashboard + latest_run.json
  Console-->>Owner: Actionable report, antifragility alerts, controls ready
```

---

## 🛡️ Governance & Safety Guarantees

- **Owner Supremacy:** Owners, guardians, approvals, and pause controls are configured directly via `governance.set` orchestration step. Contract owners can update every tunable parameter (stake floors, reward splits, validators, circuit breakers) on-demand.
- **Timelock & Guardian Hooks:** High-impact operations (e.g., treasury reallocations) honour timelock & guardian thresholds from the scenario YAML.
- **Dry-Run First:** All execution steps run in simulated mode by default, leveraging `ORCHESTRATOR_BRIDGE_MODE=python` and `eth_call` semantics.
- **Checkpointing:** Crash-safe checkpointing ensures runs can be resumed mid-flight.
- **Antifragile Monitoring:** Generated dashboards highlight stress scenarios and automatically update the alpha probability metric.

---

## 🧠 Meta-Agentic Insights

- **Self-Improving Loop:** Every run persists scoreboard deltas and logs for reinforcement. Subsequent runs learn from prior successes/failures.
- **Agent Federation:** The orchestrator registers and coordinates specialised agents (`guardian-grid-validator` etc.) with stake-aware routing.
- **Resource Orchestration:** Treasury risk parameters (VaR limits, exposure ceilings, circuit breakers) are codified in YAML and enforced automatically.
- **On-Chain Ready:** Output payloads from chain-centric steps are drop-in for AGI Jobs v0 (v2) routers and the account-abstraction paymaster stack.

---

## ⚙️ Configuration Anatomy (`config/meta_agentic_scenario.yaml`)

```yaml
plan:
  budget_max: "250000"
  approvals:
    - "council/alpha"
    - "owner/multisig"
  steps:
    - id: "identify-1"
      tool: "identify.multi-domain"
      params:
        datasets:
          finance: "data/finance/opportunity_signals.json"
          research: "data/research/breakthroughs.json"
          policy: "data/policy/regulatory_radar.json"
    - id: "governance-1"
      tool: "governance.set"
      params:
        approvals_required: 2
        configurable:
          stake_floor: "50000"
          reward_split_bps: 6500
          pause_guardian: true
    - id: "execution-1"
      tool: "job.post"
      params:
        title: "Superconductive Grid Retrofit Initiative"
        reward: "90000"
        validator: "guardian-grid-validator"
```

Each step is enforced by the orchestrator runtime and can be audited in the resulting `latest_run.json`.

---

## 🖥️ Grandiose UI Console

The regenerated `storage/ui/index.html` console now:

- Streams live alpha readiness, guardian posture, and treasury telemetry directly from `latest_run_v2.json`.
- Autogenerates the phase table and Mermaid execution timeline using the orchestrator's phase states.
- Exposes one-click artefact links (summary JSON, investor masterplan, console sources) for downstream teams.
- Highlights owner levers updated via `owner_controls.py` so stakeholders instantly see configuration deltas.

Serve it statically or drop it into any CDN – the bundle is pure HTML/CSS/JS with Mermaid handled via CDN.

---

## ✅ Testing & CI

- Unit test: `pytest demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/tests/test_meta_agentic_demo.py`
- Workflow: `.github/workflows/demo-meta-agentic-alpha-agi-jobs.yml` ensures CI greenness with lint + tests + orchestrator dry-run.
- Artefact validation ensures dashboards, reports, and JSON outputs stay current.

Run locally:
```bash
pytest demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/tests
```

---

## ♻️ Iterating Scenarios

1. Duplicate `config/meta_agentic_scenario.yaml` and adjust datasets, governance, or plan steps.
2. Re-run the CLI – checkpoints, scoreboard, and UI update automatically.
3. Extend `storage/ui/` with additional charts, or connect to live telemetry by writing to `latest_run.json`.

---

## 🧾 Troubleshooting

- **Timeout:** Increase `--timeout` or set `META_AGENTIC_DEMO_TIMEOUT` env var if CI hardware is slower.
- **Agent registry conflicts:** Delete `storage/orchestrator/agents/registry.json` to reset demo agents.
- **Mermaid not rendering:** Ensure the device has internet access (CDN served). Offline mode? Replace CDN script with local bundle.

---

## 📈 Outcome

By the end of the run you obtain:

- A structured orchestration plan with checkpoints, logs, and receipts.
- On-chain ready payloads for job posting, staking, and validation.
- Guardian-governed control plane with antifragility analytics.
- A premium UI + report kit to brief stakeholders instantly.

This demo cements AGI Jobs v0 (v2) as the sovereign operating system for compounding economic dominance – powerful, beautiful, and completely wieldable by non-technical owners.
