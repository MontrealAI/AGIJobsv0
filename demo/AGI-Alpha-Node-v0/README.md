# AGI Alpha Node v0 Demo

The **AGI Alpha Node v0 Demo** showcases how a non-technical operator can stand up a production-grade autonomous wealth engine using the AGI Jobs v0 (v2) stack. The demo lives entirely inside this repository so it can be audited, cloned, and deployed without external dependencies beyond Docker and Python 3.11.

> **Mission:** deliver a ready-to-run, governance-safe, observability-rich AGI Alpha Node that proves AGI Jobs v0 (v2) can orchestrate superintelligent economic execution at unprecedented scale.

---

## Capabilities at a Glance

- ✅ **ENS & Governance Guardrails** – automated ENS verification, governance key rotation, emergency pause with on-chain parity.
- ✅ **Full AGI Jobs v2 Integration Layer** – configuration-driven connectors for StakeManager, JobRouter, JobRegistry, IdentityRegistry, PlatformRegistry, and incentive modules.
- ✅ **MuZero-inspired Planner** – adaptive planner that continuously maximises projected reward over a configurable horizon.
- ✅ **Specialist Swarm** – finance, biotech, and manufacturing specialists with shared long-term memory and deterministic replay support.
- ✅ **Knowledge Lake** – append-only knowledge graph with summarisation, relevance scoring, and retention policies.
- ✅ **Operator Console** – a guided CLI (`agi-alpha-node`) that walks non-technical operators through bootstrap, deployment, diagnostics, compliance, and governance operations.
- ✅ **Grandiose Dashboard** – production-ready, mobile-friendly dashboard with live metrics, ENS verification badges, and mermaid diagrams explaining the economic feedback loops.
- ✅ **Prometheus Metrics & Audit Logging** – `/metrics` endpoint, structured JSON logs, tamper-evident ledger of key decisions.
- ✅ **Safety Rails** – contract pause, invariant monitoring, automated antifragility drills, and planner sanity checks.
- ✅ **One-Command Deployment** – Dockerfile & compose recipe delivering a hardened container with reproducible builds.
- ✅ **End-to-End Test Harness** – pytest suite simulating ENS verification, staking, job fulfilment, compliance scoring, and resilience drills.

---

## Quickstart (5 Minutes)

1. **Clone the repository** (already done if you're reading this).
2. **Install Python dependencies** (or run inside Docker):

   ```bash
   make demo-alpha-node-bootstrap
   ```

   The provided Makefile target installs an isolated virtualenv with pinned dependencies and pre-commits.

3. **Configure your operator profile** by copying the template:

   ```bash
   cp demo/AGI-Alpha-Node-v0/config/operator.example.yaml demo/AGI-Alpha-Node-v0/config/operator.yaml
   ```

   Fill in ENS domain, Ethereum RPC endpoint, wallet paths, and governance multisig.

4. **Launch the node:**

   ```bash
   python -m agi_alpha_node run --config demo/AGI-Alpha-Node-v0/config/operator.yaml
   ```

   The CLI verifies ENS ownership, ensures the minimum $AGIALPHA stake is locked, runs antifragility drills, and then starts the orchestrator, planner, specialists, web dashboard, and Prometheus endpoint.

5. **Visit the Operator Dashboard:**

   Navigate to `http://localhost:8055` for real-time telemetry, compliance scores, and mission control. The dashboard is entirely static HTML/JS so it can be served from any CDN or IPFS gateway.

6. **Inspect Metrics:**

   Prometheus-compatible metrics are exposed at `http://localhost:9095/metrics`. Structured logs stream to `demo/AGI-Alpha-Node-v0/state/logs/agi-alpha-node.log`.

7. **Run the Compliance Scorecard** on demand:

   ```bash
   python -m agi_alpha_node compliance --config demo/AGI-Alpha-Node-v0/config/operator.yaml --format table
   ```

8. **Pause the Node** instantly (e.g. during an incident):

   ```bash
   python -m agi_alpha_node pause --reason "Emergency maintenance"
   ```

   Resume safely with `python -m agi_alpha_node resume` once mitigations are complete.

---

## Directory Layout

```
AGI-Alpha-Node-v0/
├── Dockerfile                 # Hardened runtime image with non-root user, health checks, metrics
├── Makefile                   # Helper commands for local use and CI
├── README.md                  # You are here
├── config/
│   ├── operator.example.yaml   # Canonical configuration template
│   └── schema.json             # JSON Schema for config validation
├── scripts/
│   ├── export-metrics.py       # Local metrics viewer
│   └── run-antifragility.py    # Standalone resilience drill runner
├── src/
│   └── agi_alpha_node/
│       ├── __init__.py
│       ├── __main__.py         # Entrypoint for `python -m agi_alpha_node`
│       ├── blockchain.py       # Ethereum + ENS integration layer
│       ├── cli.py              # Operator console implementation
│       ├── compliance.py       # Governance-grade compliance scorecard
│       ├── config.py           # Config parsing, validation, secrets management
│       ├── governance.py       # Ownership, pause, and key rotation logic
│       ├── jobs.py             # Job router / registry integration and orchestration
│       ├── knowledge.py        # Knowledge Lake storage & retrieval
│       ├── logging_utils.py    # Structured logging helpers
│       ├── metrics.py          # Prometheus exporter and observability primitives
│       ├── orchestrator.py     # Planner + specialists coordination logic
│       ├── planner.py          # MuZero-inspired planner implementation
│       ├── safety.py           # Safety rails, antifragility drills, invariant checks
│       ├── scheduler.py        # Background task scheduler
│       ├── simulation.py       # Deterministic simulation harness used for tests/demo
│       └── specialists/
│           ├── __init__.py
│           ├── base.py
│           ├── biotech.py
│           ├── finance.py
│           └── manufacturing.py
├── tests/
│   ├── test_compliance.py      # Scorecard validation tests
│   ├── test_config.py          # Config validation edge cases
│   ├── test_planner.py         # Planner optimisation behaviour
│   └── test_specialists.py     # Specialist coordination and knowledge sharing
├── web/
│   ├── assets/
│   │   ├── dashboard.css       # Grandiose UI styling
│   │   ├── dashboard.js        # Live metric polling + mermaid rendering
│   │   └── mermaid.min.js      # Bundled mermaid engine (no CDN required)
│   └── index.html              # Operator dashboard
└── docker-compose.yaml         # Optional multi-service deployment (node + prometheus + grafana)
```

---

## Highlights for Auditors & Executives

- **Security First:** every on-chain interaction is wrapped in deterministic sign-off flows, pause-aware preconditions, and transaction-level audit logs. Secrets never hit stdout/stderr, and config schema enforces least-privilege defaults.
- **Economic Alpha:** the planner continuously re-evaluates strategies using reward projections that blend on-chain KPIs with knowledge-lake intelligence. Reinvestment loops are templated and policy-aware.
- **Human-in-the-loop Control:** operators can pause, resume, rotate governance keys, and override strategies from the CLI or dashboard. Safety drills run automatically, with outputs recorded for compliance.
- **Production Observability:** metrics, logs, and compliance summaries integrate seamlessly with Prometheus, Grafana, ELK, and SIEM pipelines.
- **Non-Technical Friendly:** CLI auto-discovers configuration issues, prints step-by-step guidance, and surfaces actionable remediation tips. Dashboard uses plain language, tooltips, and context cues so executives can operate the node confidently.

---

## Compliance & Testing

Run the demo’s full validation suite:

```bash
pytest demo/AGI-Alpha-Node-v0/tests -q
```

CI pipelines include linting, typing, security scans, and Docker image builds. See `Makefile` for all available automation targets.

---

## Licensing

This demo inherits the MIT License from the root of the repository.

---

## Next Steps

- Point the config at live AGI Jobs v2 contract addresses.
- Plug in production-grade specialist models (LLMs, simulation engines, quant models).
- Deploy with `docker compose up --build` and connect Prometheus/Grafana for institutional monitoring.
- Integrate with your treasury for automated reinvestment flows.

Reach out to the AGI Alpha Node core team for enterprise support, audits, and co-development opportunities.
