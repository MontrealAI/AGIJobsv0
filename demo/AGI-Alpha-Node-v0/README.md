# 🎖️ AGI Alpha Node Demo (v0)

The AGI Alpha Node demo shows how a non-technical operator can command the full power of **AGI Jobs v0 (v2)** to launch a sovereign, economically unstoppable AGI swarm. This directory contains a production-ready, safety-first implementation of an Alpha Node capable of verifying ENS control, staking $AGIALPHA, orchestrating domain specialists, and automating reinvestment with complete observability.

## Feature Highlights

- ✅ **Instant ENS Sovereignty** – Verifies subdomain ownership before any capability activates.
- 🔐 **Governance & Emergency Pause** – Multisig handover, key rotation, and `SystemPause` integration keep operators in control.
- 🪙 **$AGIALPHA Economy Integration** – Staking, rewards, slashing protection, and reinvestment with policy-aware logic.
- 🧠 **MuZero++ Planner & Specialist Swarm** – Finance, Biotech, and Manufacturing specialists orchestrated via a world-model planner with long-term memory.
- 🧠 **Knowledge Lake** – Persistent, queryable intelligence that compounds alpha over time.
- 📊 **Prometheus Metrics + Compliance Scorecard** – Exported metrics, JSON scorecard, and structured audit logs.
- 🖥️ **Operator Console & Web Command Deck** – Typer-based CLI and a cinematic web dashboard with live metrics and mermaid architecture views.
- 🚀 **One Command Deployment** – `docker compose up` brings the entire node online with production hardening baked in.
- 🛡️ **Automated Safety Rails** – Circuit breakers, drills, and invariant checks proactively pause the system under stress.

## Quickstart (Non-Technical Friendly)

1. **Clone or download** the repository and `cd demo/AGI-Alpha-Node-v0`.
2. **Copy the config**:
   ```bash
   cp config/alpha_node.example.yml config/alpha_node.yml
   ```
   Fill in your ENS subdomain, operator wallet, governance multisig, and RPC endpoint.
3. **Launch the node** with Docker:
   ```bash
   docker compose up --build
   ```
   Or run locally with Python:
   ```bash
   pip install -r requirements.txt
   export PYTHONPATH=$PWD/src
   python -m agi_alpha_node_demo run
   ```
4. **Visit the dashboard** at [http://localhost:8081](http://localhost:8081) (Docker) or [http://localhost:8080](http://localhost:8080) (local) for live intelligence.
5. **Explore the CLI**:
   ```bash
   python -m agi_alpha_node_demo --help
   ```

The CLI walks operators through ENS verification, staking, governance transfer, specialist onboarding, compliance reporting, and safety drills.

## Directory Layout

```
AGI-Alpha-Node-v0/
├── config/                 # Configuration templates and runtime configs
├── data/                   # Sample jobs and datasets for the planner & specialists
├── src/agi_alpha_node_demo/
│   ├── blockchain/         # ENS + contract interactions
│   ├── cli/                # Typer-based operator console commands
│   ├── compliance/         # Scorecard computation and reporting
│   ├── knowledge/          # Knowledge Lake persistence layer
│   ├── metrics/            # Prometheus exporter and structured logging
│   ├── orchestration/      # Planner, orchestrator, task harvester
│   ├── safety/             # System pause, drills, and invariant enforcement
│   ├── specialists/        # Domain-specific AGI agents
│   └── testing/            # Simulation utilities for integration tests
├── tests/                  # Pytest suite for end-to-end and unit coverage
├── web/dashboard/          # Web command deck (Mermaid, live metrics)
├── Dockerfile              # Hardened container image
├── docker-compose.yml      # One-command deployment
├── requirements.txt        # Python dependencies
└── README.md               # You are here
```

## Production Deployment Checklist

- ✅ ENS ownership validated against on-chain registry.
- ✅ Governance address rotated to institutional multisig.
- ✅ Minimum $AGIALPHA stake locked and monitored.
- ✅ Job Router and Registry permissions verified.
- ✅ Prometheus scraper configured (metrics available at `/metrics`).
- ✅ Logs shipped to SIEM via JSON log files in `logs/`.
- ✅ Compliance score reviewed and above configured threshold.

## Tests

Run the full suite:

```bash
pip install -r requirements.txt
PYTHONPATH=$PWD/src AGI_ALPHA_NODE_OFFLINE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest tests -q
```

For CI integration, see `.github/workflows/agi-alpha-node-demo.yml`.

## Security & Safety

- Secrets never logged. Sensitive fields use vault-friendly environment overrides.
- Every on-chain transaction is dry-run simulated before broadcast when supported by the RPC.
- `SystemPause` checks guard all mutating actions. Automatic drills validate pause/resume pathways.
- Structured audit events capture ENS, staking, planner decisions, and job lifecycle events with context-rich metadata.

## Next Steps

- Point the config at production AGI Jobs v2 contracts and run `python -m agi_alpha_node_demo bootstrap` to initialize the node.
- Connect the dashboard to your observability stack via Prometheus, Grafana, and SIEM connectors.
- Extend the Knowledge Lake with domain embeddings to accelerate cross-specialist collaboration.

Welcome to the command deck of the most powerful autonomous agent economy ever assembled.
