# Meta-Agentic National Supply Chain Grand Demo

The **Meta-Agentic α-AGI National Supply Chain** drill shows a non-technical
operator how AGI Jobs v0 (v2) stands up an entire sovereign coordination grid in
minutes. A single command deploys the production **JobRegistry**,
**StakeManager**, **ValidationModule**, **DisputeModule**, **ReputationEngine**,
**IdentityRegistry**, **FeePool**, and **CertificateNFT** modules on an
ephemeral Hardhat network, injects identities for sovereign task forces, and
replays three fully autonomous supply missions:

1. **Arctic resilience corridor** – an AGI logistics swarm hardens Arctic
   infrastructure while validator sentinels certify telemetry, resulting in
   credential issuance and automated treasury settlement.
2. **Pacific relief escalation** – a humanitarian airlift faces validator
   disagreement, governance arbitrates on-chain, slashes negligent validators,
   and still graduates the relief collective with zero manual bookkeeping.
3. **Quadratic treasury reallocation** – a delegated moderator executes a
   quadratic vote that reallocates sovereign reserves, refunds voters
   proportional to their commitments, and proves the owner can reclaim
   execution authority instantly.

Every step is narrated for executives: escrow movements, validator
commit/reveal rounds, dispute escalation, certificate minting, burn accounting,
owner overrides, and treasury telemetry. The demonstration proves that a
sovereign owner can pause, reprioritise, and reconfigure **every single
parameter** – rewards, validator incentives, burn rates, dispute fees, pauser
rights – live during a national-scale logistics surge.

```mermaid
flowchart TD
    classDef chain fill:#e7f0fe,stroke:#1f6feb,stroke-width:2px,color:#04133b
    classDef agent fill:#fdf5ff,stroke:#7e22ce,stroke-width:1.5px,color:#2b0b57
    classDef human fill:#fffbe6,stroke:#b45309,stroke-width:1.5px,color:#3f2f0c
    classDef contract fill:#ecfdf3,stroke:#047857,stroke-width:1.5px,color:#064e3b
    classDef control fill:#ffe4e6,stroke:#db2777,stroke-width:1.5px,color:#881337

    subgraph L1[AGI Jobs v0 (v2) On-Chain Core]
        JR[JobRegistry
        (task escrow)]:::contract
        SM[StakeManager
        (staking + burns)]:::contract
        VM[ValidationModule
        (commit/reveal)]:::contract
        DM[DisputeModule
        (governance court)]:::contract
        RE[ReputationEngine
        (performance tracking)]:::contract
        IR[IdentityRegistry
        (sovereign allowlist)]:::contract
        FP[FeePool
        (treasury routing)]:::contract
        CN[CertificateNFT
        (mission badges)]:::contract
    end

    subgraph L2[Meta-Agentic Supply Mesh]
        OC[Orchestrator AI
        (mission planner)]:::agent
        AL[Aurora Logistics AI
        (Arctic corridor)]:::agent
        ZS[Zephyr Relief Swarm
        (Pacific response)]:::agent
        VP[Validator Polaris]:::agent
        VMd[Validator Meridian]:::agent
        VH[Validator Horizon]:::agent
        GOV[Owner / Moderator Council]:::human
    end

    subgraph L3[Sovereign Mission Control]
        Dash[Mission Control UI
        (timeline + telemetry)]:::control
        Runbook[Runbook Automation
        (CI verified)]:::control
    end

    OC -- posts mission DAG --> JR
    AL -- stakes + submits proofs --> JR
    ZS -- submits relief manifests --> JR
    VP & VMd & VH -- commit/reveal --> VM
    VM --> JR
    JR --> SM
    SM --> FP
    JR --> CN
    DM -- arbitrates disputes --> JR
    RE -. reputation feeds .-> OC
    IR -- identity gating --> JR & SM & VM & DM
    GOV -- owner overrides & pausing --> JR & SM & VM & DM & FP
    Dash -. event ingest .-> JR & VM & DM & FP
    Runbook -. CI replay .-> Dash
```

## Quickstart

> **Prerequisites**
>
> - Node.js 20+ with this repository’s dependencies installed (`npm install`).
> - No external blockchain RPC endpoint required – the demo uses Hardhat’s
>   in-memory chain and bundles the audited bytecode for every module.

```bash
# 1. Replay the entire sovereign supply drill with full narration
npm run demo:national-supply-chain

# 2. Export a transcript for the mission control UI
npm run demo:national-supply-chain:export

# 3. Validate the transcript against unstoppable governance invariants
npm run demo:national-supply-chain:validate

# 4. Launch the static UI and autoreplay loop
npm run demo:national-supply-chain:control-room
```

Each command is **idempotent** and CI-backed. If anything diverges from the
expected ledger state, the script aborts with actionable diagnostics.

## What the CLI demonstration covers

`npm run demo:national-supply-chain` executes
[`scripts/v2/nationalSupplyChainGrandDemo.ts`](../../scripts/v2/nationalSupplyChainGrandDemo.ts)
and performs the following sequence end to end:

1. **Bootstraps the full v2 module suite** with sovereign defaults, proving the
   owner can pause/unpause every subsystem and delegate emergency operators.
2. **Seeds treasury balances and stakes** for the Arctic Climate Directorate,
   Pacific Infrastructure Authority, Aurora Logistics AI, Zephyr Relief Swarm,
   and the validator council (Polaris/Meridian/Horizon).
3. **Arctic resilience corridor mission** – escrow, validator commit/reveal,
   autonomous burn confirmation, and credential NFT issuance.
4. **Pacific relief dispute** – validator abstention triggers on-chain dispute,
   owner+moderator signatures resolve the case, validators are slashed, and the
   relief swarm still graduates with an immutable credential.
5. **Quadratic governance referendum** – treasury is rerouted to a relief
   authority, stakeholders cast identity-gated quadratic ballots, a delegated
   moderator executes the proposal, and the owner sweeps remaining escrow while
   restoring executor control.
6. **Owner mission control drill** – live parameter adjustments (fees, burn,
   stake guardrails, dispute windows) with confirmations that every module obeys
   the owner’s command.
7. **Telemetry + automation digest** – generates a machine-consumable plan that
   lists outstanding owner directives, validator signals, treasury alerts, and
   the checks that must stay green for production parity.

The transcript (`demo/National-Supply-Chain-v0/ui/export/latest.json`) contains
rich context for non-technical reviewers – every timeline event, owner action,
scenario summary, minted credential, and treasury snapshot.

[`scripts/v2/validateNationalSupplyChainTranscript.ts`](../../scripts/v2/validateNationalSupplyChainTranscript.ts)
enforces the unstoppable transcript contract. It asserts timeline depth,
sovereign owner drills, validator council quorum, certificate issuance, and the
demo’s `unstoppableScore` so the CI pipeline blocks any regression before
release.

## Mission control UI

A lightweight static UI ships alongside the CLI output. After exporting a
transcript run:

```bash
npx serve demo/National-Supply-Chain-v0/ui
# or any static server of your choice
```

The dashboard renders:

- **Timeline cards** for every orchestration step with timestamps and metadata.
- **Agent + validator portfolios** (liquid balance, staked capital, locked stake
  and reputation) so executives see who carried which mission.
- **Owner control snapshot** describing fee splits, pausers, treasury routes,
  dispute windows, and pause drills.
- **Automation recommendations** with one-click commands to replay the demo,
  export transcripts, and open the control room loop.
- **Copy-to-clipboard controls** beside every recommended command so executives
  can trigger scripted actions without retyping anything.
- **Mermaid diagrams** that visualise the live agent mesh and scenario DAG.

The UI fetches only the JSON transcript and requires **no build step**, keeping
operation friendly for non-technical decision makers.

## Continuous verification

GitHub Actions workflow
[`.github/workflows/demo-national-supply-chain.yml`](../../.github/workflows/demo-national-supply-chain.yml)
replays the export on every pull request touching this demo. The job fails if
any timeline, owner action, scenario, or telemetry array is empty, or if the UI
JSON artefact is missing. This guarantees the demo never silently regresses and
remains launchable by a single non-technical operator.

## Emergency controls and sovereignty

The demonstration emphasises sovereign authority:

- **System-wide pause** – the owner invokes `SystemPause` to freeze registry,
  staking, validation, dispute, and treasury modules in one transaction.
- **Live parameter governance** – fee percentages, burn rates, validator reward
  splits, dispute fees, reveal windows, and stake guardrails are tweaked during
  the run with on-chain confirmation.
- **Identity gating** – only whitelisted ENS-backed identities (e.g.
  `arctic.agent.agi.eth`, `pacific.validator.agi.eth`) may post jobs, bid, or
  validate. Emergency overrides are logged and require owner signatures.
- **Quadratic voting-ready** – transcripts capture stake distributions and
  validator behaviour, giving governance councils the data needed to propose
  weighted votes for future missions.

The result is a **superintelligent supply chain coordinator** that fuses
meta-agent planning with tamper-proof blockchain execution – instantly proving
that AGI Jobs v0 (v2) lets sovereign operators deploy infrastructure-scale
systems at unprecedented speed and reliability.
