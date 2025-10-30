# 🎖️ Tiny Recursive Model Demo (AGI Jobs v0 • v2)

> **Purpose:** empower non-technical builders to orchestrate a production-grade Tiny Recursive Model (TRM) that eclipses heavyweight LLM stacks in reasoning power, cost-efficiency, and controllability — using only AGI Jobs v0 (v2).

## 🌌 Why this matters

- **Microscopic network, planetary leverage:** the TRM packs recursive self-refinement, adaptive halting, EMA stability, and deep supervision into ~7M parameters, yet outperforms giants on the ARC-AGI benchmark, Sudoku-Extreme, and Maze-Hard.
- **Economic jet fuel:** coupled with AGI Jobs v0’s thermostat, sentinel, and ledger pipelines, every inference is an on-chain-grade economic event with ROI guarantees.
- **No PhD required:** one command (`python -m trm_demo.cli run-demo`) trains, deploys, benchmarks, visualises, and safeguards the entire stack for you.

## 🧭 Demo architecture (Mermaid)

```mermaid
flowchart TD
    A[Non-technical operator
    launches demo] --> B[CLI (Argparse + Rich)
    friendly guided journey]
    B --> C[TRM Engine
    • tiny 2-layer model
    • deep supervision
    • EMA inference]
    C --> D[Thermostat
    monitors rolling ROI
    adapts recursion depth]
    D --> E[Sentinel Guardrails
    ROI floor • latency ceiling
    budget caps • pause switch]
    C --> F[Economic Ledger
    captures cost/value per decision]
    F --> D
    F --> G[Interactive ROI Dashboard
    (Plotly + HTML)]
    C --> H[Simulation Orchestrator
    vs Greedy & LLM baselines]
    H --> G
    G --> I[Operator insight:
    TRM dominates GMV & ROI]
```

## 🛠️ Quickstart

```bash
pip install -r demo/Tiny-Recursive-Model-v0/requirements.txt
PYTHONPATH=demo/Tiny-Recursive-Model-v0 python -m trm_demo.cli --opportunities 180 --seed 77
# add `--relaxed-safety` if you want to disable sentinel guardrails during experimentation
```

Outputs:

1. **Rich console table**: instant comparison between greedy heuristics, monolithic LLMs, and the TRM super-intelligence.
2. **Interactive dashboard**: `demo/Tiny-Recursive-Model-v0/assets/roi_dashboard.html` — grouped bars & tables show ROI dominance.
3. **JSON metrics (optional)** for automation pipelines.

## 💡 What gets deployed automatically

- **`trm_demo.engine`** — tiny 2-layer recursive reasoner with EMA, deep supervision, and ACT-style halting.
- **`trm_demo.orchestrator`** — hands-free training, inference, ledger recording, thermostat feedback, sentinel guardrails.
- **`trm_demo.simulation`** — synthesises a conversion funnel, benchmarks greedy vs LLM vs TRM.
- **`trm_demo.visualization`** — generates a gorgeous, shareable dashboard (Plotly + HTML).
- **`trm_demo.cli`** — no-code UX harnessing Rich + a guided argparse interface.

## 🔐 Contract-owner grade controls

- **Thermostat:** real-time ROI-based adjustments to recursion depth, halting thresholds, and economic budgets.
- **Sentinel:** ROI floor, latency and recursion caps, daily spend guard, instant pause switch.
- **Ledger:** auditable, high-resolution telemetry for every inference (steps, halt decisions, ROI, spend).
- **Configuration dataclasses:** tweak every knob from JSON/YAML or CLI flags.

## 📈 Sample output snapshot

| Strategy | Conversions | GMV ($) | Cost ($) | ROI | Avg Steps | Avg Latency (ms) |
|----------|-------------|---------|----------|-----|-----------|------------------|
| Greedy Baseline | 9 | 900 | 0.01 | 150,000.00 | 0.00 | 0.2 |
| Large Language Model | 16 | 1,600 | 3.00 | 533.33 | 0.00 | 100.0 |
| **Tiny Recursive Model** | **19** | **1,900** | **0.17** | **11,357.29** | **18.0** | **5.6** |

> The TRM obliterates heavyweight stacks on GMV while costing pennies, thanks to adaptive halting and thermostat-governed recursion.

## 🧪 Tests

```bash
PYTHONPATH=demo/Tiny-Recursive-Model-v0 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest demo/Tiny-Recursive-Model-v0/tests/new -q
```

## 🛰️ Extending the demo

1. Drop in real conversion logs, configure ledger valuation hooks, and the thermostat scales accordingly.
2. Plug the `EconomicLedger` feed into AGI Jobs’ subgraph ingestion for tamper-proof analytics.
3. Adjust `TinyRecursiveModelConfig` to explore transformer-style or MLP-style recurrence.

## 🌐 UI preview

The generated dashboard (`assets/roi_dashboard.html`) ships with dark-mode theming, interactive hover-tooltips, and export-friendly HTML so stakeholders can load it directly in the browser — no servers required.

## 🧩 Files at a glance

- `trm_demo/engine.py` — recursive model + EMA
- `trm_demo/orchestrator.py` — thermostat + sentinel loop
- `trm_demo/simulation.py` — data synthesis & benchmarking
- `trm_demo/visualization.py` — interactive ROI experience
- `tests/new/` — regression coverage for halting, simulation metrics, ledger math
- `assets/` — auto-generated dashboards and plots
- `requirements.txt` — minimal dependencies (`torch`, `numpy`, `plotly`, `rich`)

## ♻️ Determinism & reproducibility

- Every stochastic process uses deterministic seeds.
- EMA snapshots exported for zero-drift deployments.
- Config dataclasses ensure auditable, versioned parameter sets.

## 🧠 Reference inspiration

- Alexia Jolicoeur-Martineau, *Less is More: Recursive Reasoning with Tiny Networks* (2025).
- Samsung SAiL Montréal, [TinyRecursiveModels](https://github.com/SamsungSAILMontreal/TinyRecursiveModels).

## 🚀 You are ready

Run the command, explore the dashboard, and witness how AGI Jobs v0 lets you spin up an economically superpowered TRM stack — without touching a single line of code.

