# AGI Alpha Node v0 Demo

The **AGI Alpha Node v0** demo showcases how a non-technical operator can stand up a fully-governed, production-grade AGI Jobs v2 node in minutes.  The demo delivers:

- **Full governance & safety controls** including ENS ownership verification, contract pause orchestration, and real-time compliance scoring.
- **Autonomous wealth generation** through a MuZero-inspired planner coordinating domain-specialist agents across finance, biotech, and manufacturing opportunities.
- **Self-improving intelligence** that continuously learns from past jobs via a persistent Knowledge Lake, compounding economic alpha over time.
- **User-first operations** with a guided command console, web dashboard, Prometheus metrics, and single-command container deployment.

> The objective is to demonstrate that AGI Jobs v0 (v2) empowers anyone – even without technical expertise – to operate an institutional-grade autonomous AGI business capable of unprecedented value creation.

## Quick Start

```bash
# 1. Launch the node in demo mode
python -m agi_alpha_node console bootstrap

# 2. Start the observability stack (dashboard + metrics)
python -m agi_alpha_node console launch-dashboard

# 3. Run the end-to-end demo job flow
python -m agi_alpha_node console run-demo
```

Each command guides the operator through configuration, verifies ENS ownership, ensures the minimum $AGIALPHA stake is in place, coordinates specialists to complete jobs, and exposes detailed metrics for auditors.

## Features at a Glance

| Capability | Description |
|------------|-------------|
| Governance & Safety | ENS ownership checks, governance key rotation, emergency pause orchestration, automated compliance scorecard |
| Economic Engine | StakeManager + FeePool integrations, automatic reward claiming, reinvestment simulator |
| Intelligence | MuZero++ planner with economic self-optimizer, finance/biotech/manufacturing specialists, Knowledge Lake memory |
| Observability | Prometheus exporter, structured logging, anti-fragility drills, Mermaid-powered dashboard |
| Deployment | Dockerfile + compose for one-command launch, fully documented runbooks |

## Directory Layout

```
AGI-Alpha-Node-v0/
├── agi_alpha_node/       # Core Python package implementing the node
├── tests/                # Pytest suite covering critical flows
├── web/                  # Static dashboard served to operators & auditors
├── Dockerfile            # Container image for instant deployment
├── docker-compose.yml    # One-command orchestrated environment
└── README.md             # This file
```

## Documentation

- [`agi_alpha_node/config.py`](agi_alpha_node/config.py) – strongly typed config loader with production defaults.
- [`agi_alpha_node/console.py`](agi_alpha_node/console.py) – CLI for non-technical operators.
- [`agi_alpha_node/planner.py`](agi_alpha_node/planner.py) – MuZero-inspired planner coordinating job execution.
- [`agi_alpha_node/specialists.py`](agi_alpha_node/specialists.py) – finance, biotech, and manufacturing agents.
- [`agi_alpha_node/compliance.py`](agi_alpha_node/compliance.py) – governance-grade compliance scoring & safety rails.
- [`agi_alpha_node/metrics.py`](agi_alpha_node/metrics.py) – Prometheus exporter and structured logging.
- [`web/dashboard.html`](web/dashboard.html) – interactive dashboard with Mermaid system map and live metrics.

For an immersive walkthrough, run `python -m agi_alpha_node console run-demo` which orchestrates the full lifecycle end-to-end.

## Production Deployment

1. **Configure** the `config/alpha-node.yaml` file with ENS domain, governance keys, and $AGIALPHA stake parameters.
2. **Run** `docker compose -f docker-compose.yml up --build` to launch the node, dashboard, and metrics endpoints.
3. **Monitor** the Prometheus endpoint at `http://localhost:9097/metrics` and the dashboard at `http://localhost:8088`.
4. **Audit** structured logs emitted to `logs/alpha-node.log` for a full historical ledger of AGI decisions.

The demo ships with sane defaults for Ethereum mainnet endpoints, enabling instant integration with production infrastructure once real keys and addresses are supplied.

## Legal & Security Notice

This demo interacts with live blockchain infrastructure.  Ensure all keys are secured, follow organizational policies for key rotation, and conduct independent security reviews prior to mainnet deployment.  The included compliance scorecard and safety rails provide strong guardrails, yet operational diligence remains essential.

