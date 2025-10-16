# α-AGI MARK Demo

The α-AGI MARK demo showcases how a non-technical operator can launch a foresight-driven decentralized market using the AGI Jobs v0 (v2) toolchain. It deploys a Nova-Seed NFT, a validator-governed risk oracle, and a bonding-curve powered funding exchange that culminates in a sovereign launch event.

## Contents

- [Architecture](#architecture)
- [Quickstart](#quickstart)
- [Owner Controls](#owner-controls)
- [Runbook](#runbook)

## Architecture

The demo deploys four core contracts:

1. **NovaSeedNFT** – ERC-721 token representing a foresight seed.
2. **AlphaMarkRiskOracle** – validator-governed approval oracle with owner override controls.
3. **AlphaMarkEToken** – ERC-20 bonding-curve market with programmable compliance gates, pause switches, base asset retargeting (ETH or ERC-20 stablecoins), launch finalization metadata, and sovereign callbacks.
4. **AlphaSovereignVault** – launch treasury that acknowledges the ignition metadata, tracks received capital, and gives the owner pause/withdraw controls for the sovereign stage.

```mermaid
flowchart TD
    classDef operator fill:#302B70,stroke:#9A7FF2,color:#fff,stroke-width:2px;
    classDef contract fill:#0F4C75,stroke:#7FDBFF,color:#FFFFFF,stroke-width:1.5px;
    classDef action fill:#1B262C,stroke:#BBE1FA,color:#FFFFFF,stroke-width:1.5px;

    subgraph Operator[Operator — guided by AGI Jobs v0 (v2)]
        Start[Run npm run demo:alpha-agi-mark]
    end

    subgraph Contracts[α-AGI MARK foresight stack]
        Seed[NovaSeedNFT\nGenesis seed minted]
        Oracle[AlphaMarkRiskOracle\nValidator quorum + overrides]
        Curve[AlphaMarkEToken\nBonding curve + compliance gates]
        Vault[AlphaSovereignVault\nIgnition manifest + treasury]
    end

    subgraph Dynamics[Market + governance dynamics]
        Investors[Investors acquire SeedShares]
        Validators[Validator approvals stream]
        Finalize[Owner finalizes sovereign ignition]
        Recap[AGI Jobs dossier for the operator]
    end

    Start --> Seed --> Oracle --> Curve --> Investors --> Validators --> Finalize --> Vault
    Oracle -. Owner override .-> Finalize
    Curve -. Emergency exit .-> Investors
    Vault --> Recap

    class Start,Recap operator
    class Seed,Oracle,Curve,Vault contract
    class Investors,Validators,Finalize action
```

```mermaid
journey
    title Operator mission timeline
    section Seed Genesis
      Boot Hardhat chain: 5
      Deploy Nova-Seed NFT: 5
    section Market Formation
      Configure bonding curve + whitelist: 4
      Investors join the SeedShares pool: 4
      Pause & resume compliance drill: 3
    section Validation & Ignition
      Validators reach quorum: 5
      Owner finalizes launch: 5
      Sovereign vault acknowledges ignition: 5
```

## Quickstart

```bash
npm run demo:alpha-agi-mark
```

This command:

1. Starts a Hardhat in-memory chain.
2. Deploys the demo contracts.
3. Simulates investor participation, validator approvals, pause/unpause sequences, and the sovereign launch transition.
4. Prints a full state recap that a non-technical operator can read to verify success.

After the run completes, two dossiers are generated under [`reports/`](reports/):

- `alpha-mark-recap.json` — machine-readable event log of the launch flow.
- `alpha-mark-recap.md` — human-friendly mission brief with flowcharts, journey timelines, and contribution visualisations.
### Network & safety controls

- `AGIJOBS_DEMO_DRY_RUN` (default `true`) keeps the run in simulation mode. When set to `false` the script prompts for an explicit
  `launch` confirmation before broadcasting.
- To target a live network supply:
  - `ALPHA_MARK_NETWORK` – Hardhat network name (e.g. `sepolia`).
  - `ALPHA_MARK_RPC_URL` – RPC endpoint.
  - `ALPHA_MARK_CHAIN_ID` – (optional) explicit chain id for the RPC.
  - `ALPHA_MARK_OWNER_KEY` – hex private key for the operator account.
  - `ALPHA_MARK_INVESTOR_KEYS` – comma-separated investor keys (at least three) with gas funds.
  - `ALPHA_MARK_VALIDATOR_KEYS` – comma-separated validator keys (at least three) with gas funds.

The script verifies every supplied account holds at least 0.05 ETH before continuing.

To run the Hardhat unit tests for the demo:

```bash
npx hardhat test --config demo/alpha-agi-mark/hardhat.config.ts
```

## Owner Controls

The demo enumerates all tunable controls in the final recap:

- Curve parameters (base price, slope, supply caps)
- Base asset retargeting between native ETH and ERC-20 stablecoins
- Compliance whitelist toggles
- Pause / emergency exit switches
- Validator council membership and approval thresholds
- Validator roster resets and approval clearing
- Launch, abort, and override controls
- Full owner control snapshot exported under `ownerControls` in the recap dossier
- Tabular owner parameter matrix available via `npm run owner:alpha-agi-mark`

## Runbook

The detailed walkthrough is stored at [`runbooks/alpha-agi-mark-runbook.md`](runbooks/alpha-agi-mark-runbook.md).
