# 🎖️ Huxley–Gödel Machine Demo (AGI Jobs v0 / v2)

> A non-technical founder launches AGI Jobs v0 (v2) and, in a single command,
> spins up a Gödel-style self-improving workforce backed by real-time economic
> telemetry, adaptive Thermostat controls, and Sentinel guard-rails.

## 🧠 Demo at a glance

```mermaid
graph LR
    Operator[make demo-agialpha] --> Config[AGIALPHA seed config]
    Config --> Engine[HGMEngine (CMP tree search)]
    Engine --> Orchestrator[Sequential orchestrator]
    Orchestrator --> Thermostat
    Orchestrator --> Sentinel
    Orchestrator --> Simulator[Stochastic GMV simulator]
    Simulator --> Ledger[SQLite lineage + ROI ledger]
    Ledger --> Report[Console + JSON summary]
    Orchestrator --> Baseline[Greedy baseline]
    Report --> UI[BI dashboards, briefings]
```

## 🚀 Run the cinematic

```bash
make demo-agialpha
```

Sample output (deterministic with the default seed):

```
=== Demo Outcome Summary ===
HGM expansions      : 30
HGM evaluations     : 30
HGM GMV             : $3,960.00
HGM Cost            : $2,550.00
HGM ROI             : 1.55

Baseline evaluations: 120
Baseline GMV        : $1,620.00
Baseline Cost       : $1,200.00
Baseline ROI        : 1.35

ROI Lift            : 0.20
GMV Lift            : $2,340.00
```

👉 **Key takeaway:** even with four times fewer trials the CMP-guided HGM earns
higher ROI and 2.3k more GMV than the greedy baseline on day zero, directly from
AGI Jobs v0.

## 🛠️ Architecture tour

| Module | Purpose |
| --- | --- |
| `hgm_demo/config.py` | Strict YAML loader (`demo_agialpha.yml`) with validation + typed dataclass. |
| `hgm_demo/engine.py` | Clade-Metaproductivity core implementing Algorithm 1 (Thompson sampling for expansion/evaluation, CMP lineage stats, best-belief selection). |
| `hgm_demo/orchestrator.py` | Thermostat/Sentinel-aware control loop coordinating expansion/evaluation, persistence, and economics. |
| `hgm_demo/simulation.py` | Synthetic yet parameterised GMV + cost model (quality deltas, ROI estimations). |
| `hgm_demo/thermostat.py` | Adaptive ROI control plane (τ/α tuning + concurrency bounds). |
| `hgm_demo/sentinel.py` | Economic guard-rails (ROI floor, budget ceiling, failure pruning). |
| `hgm_demo/persistence.py` | SQLite lineage ledger (`runs`, `agents`, `expansions`, `evaluations`). |
| `hgm_demo/report.py` | Console/table formatter for ROI & GMV deltas. |
| `hgm_demo/baseline.py` | Naive greedy policy for immediate comparison. |
| `hgm_demo/cli.py` | Entry point powering `make demo-agialpha` (JSON or rich console report). |

The ledger file `demo_hgm.sqlite` is regenerated on every run and can be opened
with any SQLite viewer to inspect the entire lineage and evaluation trail.

## ⚙️ Configuration

The seed profile lives in `config/demo_agialpha.yml`. Key knobs:

- **Economics:** `success_reward`, `evaluation_cost`, `expansion_cost`, `max_cost`
- **HGM policy:** `tau`, `alpha`, `epsilon`, `max_expansions`, `max_evaluations`
- **Thermostat:** `thermostat_interval`, `roi_target`, `concurrency_bounds`
- **Sentinel:** `roi_floor`, `max_failures_per_agent`

Override anything without editing the file:

```bash
python demo/Huxley-Godel-Machine-v0/hgm_demo/cli.py \
  --config demo/Huxley-Godel-Machine-v0/config/demo_agialpha.yml \
  --json
```

## 🧪 Focused test suite

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest demo/Huxley-Godel-Machine-v0/tests -q
```

The tests cover engine lineage propagation, configuration validation, sentinel
safety tripping, and simulator behaviour.

## 🧾 Artefacts

| Artefact | Path |
| --- | --- |
| SQLite ledger | `demo_hgm.sqlite` |
| Console summary | Printed by the CLI (and capturable with `--json`) |
| JSON payload | Standardised ROI/GMV delta for dashboards |
| Tests | `demo/Huxley-Godel-Machine-v0/tests/` |

This self-contained storyline is fully deterministic (seeded RNG) and
self-healing—perfect for day-one executive walk-throughs or investor demos.
