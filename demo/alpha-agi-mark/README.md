# α-AGI MARK 🔮🌌✨ — Foresight DEX & Risk Oracle

α-AGI MARK is a **prediction and risk intelligence exchange** completely built
with the production AGI Jobs v0 (v2) contracts and tooling that already ship in
this repository. Markets are just **jobs** with K-of-N validation, disputes, and
Certificate NFTs; forecasters are **agents**; validator committees are
stake-backed **risk oracles**; the owner retains full pause and thermostat
control.

> 🎯 **Objective** — empower a non-technical operator to stand up a fully audited
> foresight market: type a question, mint a Nova-Seed credential for the winning
> forecaster, and govern the incentives with owner dials — all without touching
> the contract code.

---

## Quickstart

### 1. Local end-to-end demo

This one command spins up a local chain, deploys the canonical v2 defaults,
posts a foresight market, runs the commit→reveal validation flow, and produces
human-readable receipts.

```bash
npm run demo:agimark:local
```

Artifacts land under `reports/localhost/agimark/`:

- `receipts/deploy.json` – deployed contract addresses and governance wiring.
- `receipts/*.json` – job submission, validation, and settlement receipts.
- `mission.md` – short narrative summary for operators and auditors.

### 2. Web3 control room

Launch the wallet-native front-end (Vite + React) and connect with MetaMask or
any injected provider. Everything runs client-side: ENS lookups, IPFS pinning,
and contract calls all come from the user’s wallet.

```bash
cd demo/alpha-agi-mark/webapp
npm install
npm run dev
```

Key panels:

- **Create Market** – chat-style prompt that pins the market spec to IPFS and
  calls `acknowledgeAndCreateJob` on the JobRegistry.
- **Open Markets** – pulls active jobs directly from the registry and links to
  IPFS metadata.
- **Validate** – validator workflow to commit, reveal, and finalize results.
- **Owner Controls** – pause/unpause and thermostat guidance for governance
  sign-off (wires into the shipped owner scripts).

### 3. Testnet (Sepolia)

Provide the usual RPC URL and signer key (Safe or EOA) and run:

```bash
export RPC_URL="https://sepolia.infura.io/v3/<api-key>"
export PRIVATE_KEY="0x..."   # signer with AGIALPHA/USDC test assets
npm run demo:agimark:sepolia
```

The script reuses the same orchestrator but skips local node setup. Receipts are
written to `reports/sepolia/agimark/`.

---

## System overview

```mermaid
flowchart LR
  subgraph Governance
    GOV[Owner Safe / Timelock]
    SP[SystemPause]
    TH[Thermostat]
  end

  subgraph Core
    JR[JobRegistry]
    SM[StakeManager]
    VM[ValidationModule]
    DM[DisputeModule]
    RE[ReputationEngine]
    NFT[CertificateNFT]
    MB[RewardEngineMB]
  end

  subgraph Offchain Policy
    ACC[Acceptance Criteria (IPFS)]
    ORA[Oracle Brief (IPFS)]
  end

  GOV --> SP
  GOV --> TH
  GOV --> JR & SM & DM
  JR --> VM --> DM --> JR
  JR --> SM
  JR --> RE
  JR --> NFT
  TH --> MB

  ACC -. informs .-> VM
  ORA -. informs .-> VM
```

---

## Directory layout

```
demo/alpha-agi-mark/
├── README.md                # operator-focused introduction
├── RUNBOOK.md               # step-by-step operational guide
├── docs/                    # Mermaid diagrams (architecture & lifecycle)
├── config/                  # market spec templates and thermostat presets
├── cli/                     # TypeScript orchestration & owner helpers
├── tests/                   # end-to-end and invariant harness scaffolding
├── webapp/                  # Vite React Web3 control room
├── Makefile                 # shortcuts for local demo & UI
└── scripts/                 # deployment helpers (local + mainnet gated)
```

Each piece is designed to be readable, inspectable, and auditable by regulators
or partners — every transaction is referenced in `reports/<network>/agimark/`.

---

## Empowering non-technical operators

1. **Plain-language prompts**: the chat interface turns a natural-language
   market description into a full IPFS spec and on-chain job without exposing
   ABI details.
2. **Zero surprises**: scripts always emit a plan before broadcasting, and the
   mainnet helper refuses to execute without an explicit `MAINNET_ACK`.
3. **Receipts-first**: every automation step writes JSON receipts and human
   summaries, so auditors and stakeholders can replay the entire lifecycle.
4. **Owner supremacy**: SystemPause, Thermostat, validator allowlists, and stake
   minimums remain under owner control through the already audited governance
   pathways — the demo only calls existing public APIs.

---

## Next steps

- Enrich the IPFS acceptance criteria with quantitative bonding-curve policies
  enforced by the validator committee.
- Plug the receipts into the existing scorecard dashboards for real-time KPI
  tracking across nations, validators, and Nova-Seed NFT issuance.
- Configure GitHub Pages to publish the `webapp` build artifact for instant,
  permissionless access.

Everything here is a **drop-in extension** of AGI Jobs v0 (v2). No new contracts,
no protocol forks — just orchestration and UX that unlock the full power of the
stack for foresight markets.

### Webapp environment

Create a `.env.local` file inside `demo/alpha-agi-mark/webapp` with the
addresses emitted by the deploy script:

```
VITE_JOB_REGISTRY=<address>
VITE_VALIDATION_MODULE=<address>
VITE_STAKE_MANAGER=<address>
VITE_DEFAULT_REWARD=1
VITE_AGENT_STAKE=1
VITE_VALIDATOR_SUBDOMAIN=alpha-validator
```

If you are running the local demo, these values are written to
`reports/localhost/agimark/receipts/deploy.json`.
