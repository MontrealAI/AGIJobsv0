# Absolute Zero Reasoner v0 Demo

The **Absolute Zero Reasoner v0** demo shows how a non-technical operator can command **AGI Jobs v0 (v2)** to stage an end-to-end self-improvement and economic-optimization pipeline inspired by *Absolute Zero: Reinforced Self-Play Reasoning with Zero Data* (Zhao et al., 2025). The demo packages a production-ready orchestration loop, verifiable rewards, sandboxed execution, economic telemetry, and guardrails into a turnkey experience that runs entirely from the current repository.

## Why this demo matters

- **Instant super capability** – The orchestrator bootstraps from zero external data, composes deduction/abduction/induction curricula, and compounds value autonomously.
- **Economic instrumentation** – Every solved skill is priced against human labour and logged into a GMV/ROI ledger that a business owner can monitor in real time.
- **Safety-first loop** – Deterministic sandboxing, task diversity checks, thermostat controls, and TRR++-style baseline learning keep the agent reliable.
- **Non-technical empowerment** – A single command (`make absolute-zero-demo`) spins up the entire flow, emits a mermaid-rich report, and surfaces actionable KPIs.

## Directory layout

```
Absolute-Zero-Reasoner-v0/
├── README.md
├── RUNBOOK.md
├── absolute_zero_reasoner_demo/
│   ├── __init__.py
│   ├── buffers.py
│   ├── config
│   │   └── default_config.yaml
│   ├── config_loader.py
│   ├── executor.py
│   ├── guardrails.py
│   ├── loop.py
│   ├── market.py
│   ├── proposer.py
│   ├── rewards.py
│   ├── run_demo.py
│   ├── solver.py
│   ├── telemetry.py
│   └── trr.py
├── reports/
│   └── (auto generated economic telemetry & dashboards)
├── requirements.txt (optional extras for notebook visualisation)
└── tests/
    ├── test_executor.py
    └── test_loop.py
```

## Quick start

```bash
cd demo/Absolute-Zero-Reasoner-v0
python -m absolute_zero_reasoner_demo.run_demo --iterations 10 --tasks 4
```

The command prints a JSON summary, writes a telemetry JSON trace, and produces a Markdown + Mermaid dashboard at `reports/absolute_zero_reasoner_report.md`.

To integrate with project tooling, run:

```bash
make absolute-zero-demo
```

This Make target (added in the repo root) runs the demo with production-safe defaults and stores the latest KPI snapshot under `reports/`.

## Artefacts produced

- `reports/absolute_zero_reasoner_metrics.json` – structured per-iteration telemetry for dashboards or BI tools.
- `reports/absolute_zero_reasoner_report.md` – narrative report with Mermaid line charts, ROI table, and guardrail notes.
- Console JSON snapshot – final ROI, GMV, compute spend, and TRR++ baselines.

## Extending the demo

1. **Swap the model backend** – Replace the stochastic solver in `solver.py` with a direct bridge to AGI Jobs v0 fm.chat adapters.
2. **Wire into production jobs** – Connect `market.py` to live GMV data for on-chain proof of impact.
3. **Stream telemetry** – Push `TelemetryStream` events into the existing observability bus to power live dashboards.

The code paths already expose configuration hooks (`config/default_config.yaml`) so operators can experiment without touching Python.

## Guarantees

- Fully deterministic sandboxed execution with dual-run verification.
- Configurable guardrails preventing runaway task difficulty or format drift.
- Baseline tracking compatible with TRR++ reward normalisation.
- Runs completely offline while remaining ready to connect to production AGI Jobs infrastructure.

For operational guidance see `RUNBOOK.md`.
