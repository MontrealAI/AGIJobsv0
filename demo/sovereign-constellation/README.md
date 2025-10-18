# Sovereign Constellation Demo — AGI Jobs v0 (v2)

Sovereign Constellation is the flagship, civilization-scale demonstration for AGI Jobs v0 (v2). A single
non-technical operator can command multiple autonomous labour hubs that live on different Ethereum networks,
linking research, industrial execution, and civic governance into one orchestrated mission. The demo ships
as code, configuration, documentation, automated tests, and CI hooks so that it is immediately deployable in a
production-critical environment.

> **Mission control for an intelligent economy.** Sovereign Constellation composes only the audited AGI Jobs v2
> contracts. By wiring several full protocol stacks into one orchestration layer, it proves that anyone who can
> run `npm run demo:sovereign-constellation` can manage a planetary workforce of specialised AGI hubs without
> writing a single line of code.

## Network-of-networks topology (Mermaid)

```mermaid
graph LR
    Mission[Grand Mission Intent]
    Playbooks[Constellation Playbooks]
    Orchestrator[[Constellation Orchestrator Service]]
    Console[Wallet-first Constellation Console]

    subgraph HubA[Helios Research Hub — Ethereum Mainnet]
        JR1[JobRegistry]
        VM1[ValidationModule]
        SM1[StakeManager]
        ID1[IdentityRegistry]
    end
    subgraph HubB[Triton Industrial Hub — Arbitrum One]
        JR2[JobRegistry]
        VM2[ValidationModule]
        SM2[StakeManager]
        ID2[IdentityRegistry]
    end
    subgraph HubC[Athena Governance Hub — Optimism]
        JR3[JobRegistry]
        VM3[ValidationModule]
        SM3[StakeManager]
        ID3[IdentityRegistry]
    end

    Mission --> Playbooks
    Playbooks --> Orchestrator
    Orchestrator --> JR1
    Orchestrator --> JR2
    Orchestrator --> JR3
    Console --> Orchestrator
    Validators[Validators & Agents] --> Console
    Validators --> SM1
    Validators --> SM2
    Validators --> SM3
    Owners[Owner / Multisig] --> Console
    Owners --> JR1
    Owners --> JR2
    Owners --> JR3
```

## Commit–reveal cadence with instant owner override (Mermaid)

```mermaid
sequenceDiagram
    participant Owner
    participant Mission
    participant Orchestrator
    participant Hub as Hub Contracts
    participant Validators

    Mission->>Orchestrator: Select playbook & review steps
    Orchestrator->>Owner: Wallet prompts for createJob signatures
    Owner->>Hub: createJob (reward, deadline, specHash, uri)
    Hub-->>Validators: JobCreated events broadcast cross-network
    loop Commit window
        Validators->>Hub: commitValidation(jobId, hash, subdomain, proof)
    end
    loop Reveal window
        Validators->>Hub: revealValidation(jobId, approve, salt)
    end
    Hub-->>Owner: JobFinalized / disputes ready
    Owner->>Hub: pause(), setCommitRevealWindows(), setMinStake(), setDisputeModule() at will
```

## Capabilities

- **Multi-network orchestration** – hubs list their RPC endpoints and chain IDs. The orchestrator prepares unsigned
  transactions tagged with the network metadata so a browser wallet can route each action to the correct chain.
- **Playbook-driven missions** – curated JSON playbooks expand a single mission intent into cross-hub job flows that
  cover research, manufacturing, governance, and crisis management.
- **Owner governance atlas** – every module across every hub is surfaced with direct `writeContract` links so the owner
  can pause, reconfigure, or rotate governance instantly.
- **Wallet-first UX** – no private keys ever touch the server. The console simply prepares payloads, the operator signs
  from their wallet, and AGI Jobs v2 enforces escrow, staking, and validation.
- **Full automation envelope** – scripts deploy constellations locally, seed demo data, and rotate governance to a Safe.
- **Production readiness** – TypeScript builds, Hardhat integration tests, Cypress smoke checks, and CI wiring ensure the
  constellation stays green on every commit.

## Directory layout

```
demo/sovereign-constellation/
├── README.md
├── config/
│   ├── constellation.ui.config.json
│   ├── constellation.hubs.json
│   ├── playbooks.json
│   └── actors.json
├── server/
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── index.ts
├── app/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       └── lib/
├── scripts/
│   ├── deployConstellation.ts
│   ├── seedConstellation.ts
│   └── rotateConstellationGovernance.ts
├── test/
│   └── SovereignConstellation.t.ts
└── cypress/
    └── e2e/
        └── sovereign-constellation.cy.ts
```

## Quick start

1. **Install dependencies**
   ```bash
   npm ci --no-audit --prefer-offline --progress=false
   npm ci --prefix demo/sovereign-constellation/server --no-audit --prefer-offline --progress=false
   npm ci --prefix demo/sovereign-constellation/app --no-audit --prefer-offline --progress=false
   ```
2. **Launch a local constellation**
   ```bash
   npm run demo:sovereign-constellation:local
   ```
   The helper script deploys three hubs to a local Hardhat node, seeds showcase jobs, starts the orchestrator on
   `http://localhost:8090`, and serves the console on `http://localhost:5179`.
3. **Open the Sovereign Constellation console** and connect a wallet (e.g., MetaMask configured for `localhost:8545`).
   Select a mission playbook, review all cross-network steps, and sign the prepared transactions as they appear.

## Owner control matrix

The generated `reports/sovereign-constellation/owner-atlas.md` documents every control surface. Highlights:

- `SystemPause` + `JobRegistry.pause()` across all hubs for immediate halts.
- `ValidationModule.setCommitRevealWindows()` to retune validation cadence in flight.
- `StakeManager.setMinimumStake()` and `setDisputeModule()` to adjust validator economics.
- `IdentityRegistry.addAdditionalAgent/Validator()` to update allowlists live.

All links route directly to the relevant explorer `writeContract` tab or the Hardhat script that performs the change.

## Tests

- `demo/sovereign-constellation/test/SovereignConstellation.t.ts` – spins up three hubs, runs a full playbook, commits
  & reveals validations, and proves finalisation across networks.
- `demo/sovereign-constellation/cypress/e2e/sovereign-constellation.cy.ts` – smoke test ensuring the UI loads hero metrics,
  multi-network hub data, and playbook previews.

## Continuous integration

`.github/workflows/ci.yml` contains a dedicated **Sovereign Constellation** job. It installs server/app dependencies and
ensures both build successfully on every PR and on main. Branch protections must require this job to stay green, guaranteeing
that the constellation demo is always production-ready.

---

Sovereign Constellation demonstrates that AGI Jobs v0 (v2) empowers operators to run civilization-scale AGI operations in
minutes. Nothing new is deployed on-chain; everything is composed from hardened contracts, giving the owner absolute control
while realising unprecedented reach.
