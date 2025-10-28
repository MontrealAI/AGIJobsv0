# AGI Alpha Node Demo (v0)

> **Mission**: Empower any non-technical operator to launch a production-grade AGI Alpha Node – a sovereign, revenue-maximising, self-improving intelligence – with a single command.

## 🎯 Why this demo matters

This demo shows how **AGI Jobs v0 (v2)** lets a non-technical founder bootstrap an ENS-verified, $AGIALPHA-staked, fully orchestrated Alpha Node that can autonomously:

- Verify institutional-grade identity via ENS subdomains.
- Stake, earn, and reinvest $AGIALPHA using the v2 incentive engine.
- Orchestrate a swarm of specialist agents with antifragile world-model planning.
- Deliver verifiable work into AGI Jobs smart contracts while maintaining owner control.
- Deploy in seconds inside a hardened container with built-in monitoring, offline resilience, and an intuitive command surface.

All design decisions were made with high-stakes production environments in mind. Every workflow embraces observability, explicit operator overrides, and auditable security boundaries.

---

## 🧭 System architecture

```mermaid
flowchart TD
    subgraph Operator HQ
        CLI["One-command Operator CLI\n(ensures ENS + stake)"]
        Dashboard["Real-time Earnings Dashboard\n(PWA + metrics gateway)"]
    end

    subgraph AlphaNode["AGI Alpha Node Container"]
        Control["Owner-Control Plane\n(pausable, upgradable)"]
        ENSGuard["ENS Identity Verifier"]
        StakeMgr["$AGIALPHA Stake Orchestrator"]
        JobMesh["Job Orchestration Mesh"]
        AIHive["Swarm Intelligence Fabric\n(MuZero++ planner + domain agents)"]
        Resilience["Antifragile Safety Shell"]
        Metrics["Observability + Compliance Logger"]
    end

    ENS["ENS Registry / NameWrapper"]
    Chain["AGI Jobs v2 Contracts\n(JobRegistry, StakeManager, FeePool, PlatformRegistry)"]
    Storage["IPFS / L2 Proof Vault"]

    CLI --> Control
    Control --> ENSGuard
    Control --> StakeMgr
    Control --> JobMesh
    Control --> Resilience
    Control --> Metrics

    ENSGuard --> ENS
    StakeMgr --> Chain
    JobMesh --> Chain
    JobMesh --> Storage
    AIHive --> JobMesh
    Resilience --> AIHive
    Metrics --> Dashboard
    Dashboard --> Operator HQ
```

---

## 🚀 Quick start (non-technical friendly)

1. **Install Docker** (or use the provided Kubernetes Helm chart for clusters).
2. **Obtain `$AGIALPHA`** and register `yourname.alpha.node.agi.eth` following the guided CLI.
3. **Launch**:

   ```bash
   docker run --rm \
     -e ALPHA_NODE_ENS=yourname.alpha.node.agi.eth \
     -e ALPHA_NODE_RPC=https://mainnet.infura.io/v3/<key> \
     -e ALPHA_NODE_PRIVATE_KEY=<hex> \
     montrealai/agi-alpha-node-demo:latest
   ```

4. The container self-validates ENS ownership, performs staking (if required), spawns the swarm intelligence fabric, and exposes:
   - `https://localhost:8443` – Operator dashboard (earnings, stake health, task queue)
   - `grpc://localhost:7443` – Secure agent RPC mesh
   - `wss://localhost:9443` – Job event stream

A full dry-run simulator is available for offline mode: `npm run dev -- --simulate`.

---

## 🧩 Directory map

```text
AGI-Alpha-Node-v0/
├── README.md                – This launchpad
├── package.json             – Independent TypeScript toolchain
├── tsconfig.json
├── .eslintrc.cjs / .prettierrc.json
├── config/
│   ├── defaults.ts          – Opinionated production defaults
│   └── registry.schema.yml  – Declarative config schema for non-dev operators
├── scripts/
│   ├── bootstrap-ens.ts     – Automates ENS subdomain setup + resolver wiring
│   └── stake-and-activate.ts – Stakes & activates via PlatformIncentives
├── src/
│   ├── index.ts             – Resilient Alpha Node orchestrator entrypoint
│   ├── ai/
│   │   ├── planningEngine.ts – MuZero-inspired planner
│   │   ├── antifragileShell.ts – Stress harness & self-hardening
│   │   └── agentRegistry.ts – Domain agent roster with hot-plug plugins
│   ├── core/
│   │   ├── controlPlane.ts  – Owner overrides, pausing, parameter governance
│   │   ├── dashboard.ts     – Live earnings API server (Express + SSE)
│   │   ├── lifecycle.ts     – Node lifecycle orchestration state machine
│   │   └── metrics.ts       – Prometheus + compliance logging adapter
│   ├── integration/
│   │   ├── ensVerifier.ts   – ENS ownership proofs & caching
│   │   ├── stakingManager.ts – $AGIALPHA stake flows & reward accounting
│   │   └── jobMesh.ts       – Contracts integration & job execution loop
│   └── utils/
│       ├── config.ts        – Layered config loader (env, yaml, cli)
│       ├── security.ts      – Key management helpers
│       └── telemetry.ts     – Structured logging facade
├── contracts/
│   └── AlphaNodeController.sol – Owner-governed reference contract (pause/update parameters)
├── web/
│   ├── dashboard.html       – PWA operator console (Mermaid + charts)
│   └── assets/
│       └── styles.css
├── docker/
│   ├── Dockerfile           – Hardened container for one-command launch
│   └── docker-compose.yml   – Multi-service (node + grafana + postgres) stack
└── tests/
    ├── antifragileShell.test.ts
    ├── config.test.ts
    └── integration.test.ts  – ENS + staking mocks, job lifecycle simulation
```

---

## ⚙️ Production assumptions

- **Ethereum mainnet-grade infrastructure** (or Sepolia/local Anvil for testing) using configurable RPC endpoints.
- **Canonical `$AGIALPHA` ERC-20** (18 decimals) and AGI Jobs v2 contract addresses bundled as defaults.
- **Vault-managed keys**: the demo supports env-based keys but ships with Hashicorp Vault integration stubs for enterprises.
- **Observability-first**: Prometheus/OpenTelemetry metrics, structured Pino logs, and compliance-grade audit log emission (anchored to IPFS/Arweave).

---

## 🧪 Verification & CI

- `npm run ci` – Lint, test, build for the demo package.
- GitHub workflow `demo-agi-alpha-node.yml` executes on PRs + main, ensuring visibility.
- Tests cover config validation, antifragile stress loop hardening, and contract integration guards using deterministic mocks.

---

## 🔐 Owner-first governance

The demo includes an owner-authoritative control plane (and a reference Solidity controller) with:

- **Immediate pause/resume** of orchestration, staking, and payouts.
- **Hot parameter updates** (reward split overrides, job filters, stake thresholds) gated by multi-sig / time-lock ready hooks.
- **Upgradeable connectors** for contract addresses and ENS roots.

The accompanying [`AlphaNodeController.sol`](contracts/AlphaNodeController.sol) reference contract gives the owner on-chain levers for pausing, resuming, and updating orchestrator parameters with full event transparency.

The orchestration layer enforces runtime checks so the owner can override any decision, guaranteeing custodial control over operations.

---

## 🌐 UI & immersion

- **Mermaid-driven storyboards** embedded into the dashboard to communicate state to non-technical stakeholders.
- **Live flowcharts** that reflect the active swarm topology.
- **Budget + alpha projections** derived from the economic optimizer, visualised as goal-seeking trajectories.
- **One-click job replay** to audit outputs and validator decisions.

---

## 🛡️ Antifragile safety shell

The `antifragileShell` module continuously stress-tests the node with simulated shocks:

- ENS outages
- Gas price spikes
- Validator disputes
- Model drift events

Failures trigger automated hardening: configuration back-offs, retraining of agents, or escalation to the owner. Every incident is recorded with an IPFS-pinned postmortem bundle.

---

## 🧠 Economic self-optimization

The planner monitors alpha across:

- Net $AGIALPHA velocity (earnings – gas – reinvestment)
- Stake growth trajectory
- Job class profitability (via multi-armed bandit policy)

Profits automatically reinforce the node (compound staking, upgrade compute), ensuring relentless economic ascent.

---

## 📡 Integration surface

- **CLI** (`npm run dev -- --help`) for onboarding, audits, offline simulation, governance actions.
- **gRPC / REST** endpoints for orchestrating sub-agents and third-party clients.
- **Event stream** bridging JobRegistry events to downstream analytics.
- **SDK-ready** TypeScript modules with typed responses for easy extension.

---

## 🧭 Next steps

1. Install dependencies: `npm install`
2. Run simulator: `npm run dev -- --simulate`
3. Deploy container: `docker compose -f docker/docker-compose.yml up`
4. Connect to AGI Jobs mainnet: `npm run dev -- --ens <you.alpha.node.agi.eth> --rpc <rpc> --stake 5000`

This demo proves that AGI Jobs v0 (v2) turns ambitious operators into custodians of super-intelligent, economy-rewriting agents – without writing a single line of code.
