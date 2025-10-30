# 🎖️ Huxley–Gödel Machine Demo (AGI Jobs v0 / v2)

> A cinematic, operator-focused walkthrough showing how AGI Jobs v0 (v2) spins up
> a Gödel-style, provably improving workforce, aligns it with Thermostat
> governance, and keeps Sentinel safeguards illuminated for non-technical
> stakeholders.

## 🎬 Storyline synopsis

| Act | Title | Narrative beat |
| --- | --- | --- |
| I | **Signal ignition** | The operator proclaims revenue goals, ROI floors, and ethical guard-rails. Sentinel loads the constraint envelope while the Thermostat locks a target ROI band. |
| II | **Recursive bloom** | The CMP (Clade Metaproductivity) engine explores, evaluates, and promotes agents into a lineage tree, constantly nudged by Thermostat feedback. |
| III | **Audit coronation** | Baseline vs. CMP outcomes are benchmarked, ROI deltas are narrated, and reports are delivered for audit, BI dashboards, and executive review. |

## 🧱 Prerequisites

| Tooling | Minimum | Notes |
| --- | --- | --- |
| Python | 3.10+ | Used by the simulator CLI and the guided launcher. `python3 --version` should report ≥ 3.10. |
| Node.js & npm | 20.18.x (per `package.json`) | Needed for the guided launcher (`demo_hgm.js`) and optional linting via `npm run …`. |
| make | POSIX make | Simplifies one-click execution with `make demo-hgm`. |

Optional but recommended:

- `npm install` at the repository root (once) so shared tooling such as Prettier is
  available without additional flags.
- `npx prettier --write demo/Huxley-Godel-Machine-v0/**/*.md` to stay aligned with
  repository formatting conventions.

## 🚀 One-click guided launch

Run the entire storyline—including environment checks, pacing hints, and artefact
collection—using the new Makefile target:

```bash
make demo-hgm
```

What happens under the hood:

1. `demo/Huxley-Godel-Machine-v0/scripts/demo_hgm.js` (Node) validates the Python
   toolchain using the shared `scripts/utils/parseDuration.js` helper to respect
   `HGM_GUIDED_PACE`.
2. Environment variables (`HGM_GUIDED_MODE`, `PYTHONPATH`, report directory) are
   exported and echoed to the console.
3. `python -m demo.huxley_godel_machine_v0.simulator` is invoked with the
   guided configuration, streaming CMP vs. baseline metrics to
   `demo/Huxley-Godel-Machine-v0/reports/guided/` while also updating
   `web/artifacts/comparison.json` for the UI.

### Customising the guided ritual

- Adjust pacing: `HGM_GUIDED_PACE=3s make demo-hgm`
- Select a different report directory:
  `HGM_REPORT_DIR=$(pwd)/reports/custom make demo-hgm`
- Forward additional CLI arguments to the simulator via `ARGS`:
  `ARGS="--set simulation.total_steps=60" make demo-hgm`
- Issue contract-owner overrides directly from the CLI. Examples:
  - Pause every new task: `ARGS="--set owner_controls.pause_all=true" make demo-hgm`
  - Freeze expansions but keep evaluations running:
    `ARGS="--set owner_controls.pause_expansions=true" make demo-hgm`
  - Cap the number of actions scheduled by the CMP engine:
    `ARGS="--set owner_controls.max_actions=25" make demo-hgm`

Whenever an override is active the simulator surfaces the directive in both the
console log (look for the `Owner=` segment on summary lines) and inside the
generated `summary.json` artefact so that auditors can verify who froze or
throttled the machine.

### Manual execution (no guidance)

Prefer a direct invocation? You can still run:

```bash
python -m demo.huxley_godel_machine_v0.simulator \
  --output-dir demo/Huxley-Godel-Machine-v0/reports \
  --ui-artifact demo/Huxley-Godel-Machine-v0/web/artifacts/comparison.json \
  --set simulation.total_steps=120
```

## 🛰️ Landing console (UI/UX narrative)

A dedicated landing page renders the storyline with Bootstrap styling and live
Mermaid diagrams:

- **Entry point:** `demo/Huxley-Godel-Machine-v0/ui/index.html`
- **Assets:** `styles.css`, `viewer.js` (within the same directory)
- **Integration:** The guided launcher sets `HGM_GUIDED_PACE_MS`, which the UI can
  mirror by visiting `index.html?pace=2200` (values in milliseconds).

Open the page locally (double-click or serve via any static file server) to share
an operator-friendly narrative of the entire experience.

The Observatory section ingests `web/artifacts/comparison.json`, rendering
summary cards, ROI trajectories, and a lineage browser side-by-side. The JSON
is refreshed automatically whenever the simulator CLI completes a run.

## 🧭 Architecture atlas

```mermaid
graph TD
  Operator[Operator :: make demo-hgm] --> Launcher{Guided Launcher}
  Launcher -->|uses| Scripts(parseDuration.js helper)
  Launcher -->|spawns| DemoCLI[run_demo.py]
  DemoCLI --> ConfigLoader
  ConfigLoader -->|hydrates| Thermostat
  ConfigLoader -->|hydrates| Sentinel
  DemoCLI --> CMP[Clade Metaproductivity Engine]
  CMP --> Ledger[Economic Ledger]
  Ledger --> Reports[JSON / Markdown artefacts]
  Reports --> UI[Landing UI]
  Reports --> Auditors
```

### Flow of control

```mermaid
flowchart LR
    Start((Launch)) --> Validate[Tooling validation]
    Validate --> Configure[Export HGM_* env vars]
    Configure --> Simulate{Run demo}
    Simulate -->|CMP| Lineage[Agent lineage tree]
    Simulate -->|Baseline| BaselineTrack
    Lineage --> Metrics[ROI / GMV metrics]
    BaselineTrack --> Metrics
    Metrics --> ThermostatAdjust[Thermostat tuning]
    Metrics --> SentinelCheck[Sentinel guard-rails]
    SentinelCheck -->|breach| Halt[Pause expansions]
    SentinelCheck -->|ok| Simulate
    Metrics --> Artefacts[summary.json, timeline.json, summary.txt]
    Artefacts --> Observatory[UI + dashboards]
```

## 🛠️ Operator controls

Every parameter is editable in `config/hgm_demo_config.json`. Highlights:

| Area | Key settings | Impact |
| --- | --- | --- |
| Economics | `success_value`, `evaluation_cost`, `expansion_cost`, `max_budget` | Align the demo with token, compute, or fiat economics. |
| HGM | `tau`, `alpha`, `epsilon`, `concurrency` | Define exploration vs. exploitation and job parallelism. |
| Thermostat | `target_roi`, `roi_window`, `tau_adjustment`, `alpha_adjustment` | Auto-tune ROI behaviour for aggressive or conservative scaling. |
| Sentinel | `min_roi`, `max_failures_per_agent`, `hard_budget_ratio` | Enforce guard-rails with instant operator overrides. |

Override any value without editing JSON:

```bash
python -m demo.huxley_godel_machine_v0.simulator \
  --set simulation.evaluation_latency=[0,0] \
  --set hgm.tau=0.8
```

### 🎛️ Owner console shortcuts

- Launch the interactive operator console:

  ```bash
  make hgm-owner-console
  ```

  The console prints the current directives, lets you toggle pauses or caps
  without touching JSON, and emits ready-to-copy `--set owner_controls.*` flags
  for `make demo-hgm` and `run_demo.py`.

- Automate from CI or scripts without prompts:

  ```bash
  python demo/Huxley-Godel-Machine-v0/scripts/hgm_owner_console.py \
    --pause-expansions on \
    --max-actions 18 \
    --note "Throttle for executive review" \
    --output demo/Huxley-Godel-Machine-v0/config/owner_overrides.json
  ```

  The generated JSON can be supplied to the simulator via
  `--set owner_controls=$(cat owner_overrides.json)` or by checking the file
  into version control for reproducible rollouts.

### 🔐 Governance operations

Contract owners can now steer the on-chain deployment without touching raw
calldata thanks to the `HGMControlModule` facade introduced in `contracts/v2/admin`.

1. **Review targets** – ensure `config/hgm-control-module.json` points to the
   live JobRegistry, StakeManager, SystemPause, PlatformRegistry, and
   ReputationEngine addresses.
2. **Stage parameter changes** – edit the same JSON file to tweak pauser
   delegates, treasury destinations, or reputation tuning.
3. **Dry-run the rollout** – execute
   ```bash
   npm run owner:update-all -- --network mainnet
   ```
   to preview the transaction bundle that `HGMControlModule` will submit.
4. **Execute with governance** – rerun the command with `--execute` (optionally
   supplying `--safe` parameters) to push the updates through your multisig or
   timelock. The script will fan-out to the registry, StakeManager, and pause
   orchestration contracts.
5. **Emergency pause** – schedule a `pauseSystem()` call on
   `HGMControlModule` (for example by adding it to your `owner:update-all`
   change set) to halt jobs, staking, and dispute flows in one step.

These procedures keep AGI Jobs v0 fully governable while maintaining parity
between the off-chain simulator and the production contracts.

## 🔬 Output interpretation

- Console output includes side-by-side CMP vs. baseline summaries.
- `summary.json` captures ROI lift, GMV, and profit deltas for BI tooling.
- `hgm_timeline.json` / `baseline_timeline.json` record every decision for
  plotting or compliance review.
- `summary.txt` mirrors the table for quick sharing.
- `roi_comparison.svg` provides an inline ROI chart suitable for slide decks.
- `logs.md` aggregates step-by-step narratives for both strategies.
- `comparison.json` (configurable via `--ui-artifact`) feeds the interactive UI.
- `hgm_lineage.mmd` encodes a Mermaid diagram of the entire agent tree, with the
  best-belief agent highlighted for instant reuse.

## ✅ CI smoke tests for non-technical reviewers

Minimal commands that mirror CI behaviour without deep domain knowledge:

1. **Verify the demo succeeds deterministically**
   ```bash
   make demo-hgm
   ```
2. **Run the focused simulation regression**
   ```bash
   python -m pytest demo/Huxley-Godel-Machine-v0/tests/test_simulation.py::test_hgm_outperforms_baseline
   ```
3. **Check formatting / linting (leverages repo tooling)**
   ```bash
   npx prettier --check demo/Huxley-Godel-Machine-v0/README.md demo/Huxley-Godel-Machine-v0/ui/index.html
   ```

These steps require only Python + Node tooling and align with the repository’s
existing `npm`-based workflows.

## 🧪 Programmatic access

Use the demo module directly from Python to compose notebooks or automated jobs:

```python
from pathlib import Path

from demo.huxley_godel_machine_v0.simulator import run_simulation

report = run_simulation(
    config_path=Path("demo/Huxley-Godel-Machine-v0/config/hgm_demo_config.json"),
    seed=2025,
    overrides=[("simulation.total_steps", 48)],
    output_dir=Path("demo/Huxley-Godel-Machine-v0/reports/notebook"),
    ui_artifact_path=Path("demo/Huxley-Godel-Machine-v0/web/artifacts/notebook.json"),
)

print(report.summary_table)
print("Artefacts written to", report.summary_json_path.parent)
```

## 🛡️ Production-ready safeguards

- **Full operator override** – Adjust config, pause expansions, or switch to a
  manual seed at any time.
- **Hard stop switches** – Sentinel halts work if ROI or budget thresholds are
  crossed.
- **Audit trails** – Every evaluation snapshot is logged for compliance, making
  financial reconciliation and incident response straightforward.
