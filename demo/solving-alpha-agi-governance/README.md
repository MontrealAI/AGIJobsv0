# Solving α‑AGI Governance Demo

This demonstration turns the existing AGI Jobs v0 (v2) contracts, scripts, and UI packages into an
interactive rehearsal of nation-scale governance. No new Solidity or bespoke tooling is introduced –
only the functionality already shipped in this repository. The result is a browser-first cockpit that
lets non-technical operators launch policy proposals, coordinate wallet-controlled validators through
commit–reveal, and exercise full owner controls (pause, quorum changes, timing windows) in real time.

The experience lives inside the **Enterprise Portal** application and complements the existing
governance scripts and tests. It is immediately reusable on Hardhat, Sepolia, or Ethereum mainnet by
pointing the UI at the addresses produced by the deployment toolchain.

## 1. Prerequisites

1. Install dependencies once from the repository root:

   ```bash
   npm install
   ```

2. Produce or collect a deployment manifest so the UI knows which contracts to speak to. Any of the
   existing workflows works:

   ```bash
   # Example – one-click stack on Hardhat
   npm run deploy:oneclick:auto -- --network hardhat
   ```

   The generated `deployment-config/latest-deployment.<network>.json` file contains all addresses
   referenced below.

3. Configure the Enterprise Portal with the deployment artefacts by creating
   `apps/enterprise-portal/.env.local`:

   ```dotenv
   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
   NEXT_PUBLIC_CHAIN_ID=31337
   NEXT_PUBLIC_JOB_REGISTRY_ADDRESS=0x...
   NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS=0x...
   NEXT_PUBLIC_STAKE_MANAGER_ADDRESS=0x...
   NEXT_PUBLIC_STAKING_TOKEN_ADDRESS=0x...
   NEXT_PUBLIC_CERTIFICATE_NFT_ADDRESS=0x...
   NEXT_PUBLIC_TAX_POLICY_ADDRESS=0x...
   NEXT_PUBLIC_STAKING_TOKEN_SYMBOL=$AGIALPHA
   ```

   All values come directly from the existing deployment scripts. No contract changes are required.

## 2. Launch the civic cockpit

Start the Enterprise Portal in development mode:

```bash
cd apps/enterprise-portal
npm run dev
```

Open `http://localhost:3000/solving-governance` in any browser wallet. The route renders the new
**Solving α‑AGI Governance** experience while reusing the existing language selector, wallet context,
and styling.

### What the cockpit delivers (all on top of the audited v2 protocol)

* **Nation proposal workstation** – preloaded scenarios for multiple nations. Each publishes a job via
  `JobRegistry.acknowledgeAndCreateJob`, automatically managing $AGIALPHA allowances based on the
  on-chain fee percentage.
* **Policy author flow** – stakes via `StakeManager.depositStake`, applies with
  `JobRegistry.applyForJob`, and submits results using `JobRegistry.submit`. Result hashes are derived
  client-side and persisted for the validator phase.
* **Burn receipt tooling** – employers record burn evidence through `JobRegistry.submitBurnReceipt`
  and confirm via `JobRegistry.confirmEmployerBurn` before final settlement.
* **Validator console** – wallet addresses commit and reveal using `ValidationModule.commitValidation`
  and `ValidationModule.revealValidation`. Salts are stored in localStorage per job/validator to
  simplify reveals for non-technical operators. Validator selection (`selectValidators`) and
  validation finalisation (`finalize`) are also one-click.
* **Owner command panel** – when the connected wallet matches the on-chain owner, the UI exposes
  pause/unpause controls and setters for quorum and commit/reveal windows. These calls reuse the
  existing `ValidationModule` and `JobRegistry` ABIs and respect ownership checks.
* **Live registry view** – every job rendered is fetched from `JobRegistry.jobs` and decoded through
  `JobRegistry.decodeJobMetadata`. Locally-created metadata (nation titles, policy summaries, URIs) is
  cached for replay but the UI works against arbitrary jobs deployed elsewhere.

The UI is deliberately textual. It is aimed at policy teams that need clear instructions rather than a
flashy demo. Every action echoes the exact contract call being executed, so it can double as an owner
training aid.

## 3. Multi-actor rehearsal

Run the existing integration that mirrors the demo flow:

```bash
npx hardhat test --no-compile test/v2/solvingAlphaGovernance.integration.test.ts
```

The test bootstraps two nation sponsors, a shared policy drafter, three validators, and the owner. It
walks through staking, proposal creation, commit–reveal, owner pause/unpause, quorum tightening, and
final settlement. Keeping this test green ensures the UI remains grounded in the audited behaviour of
AGI Jobs v0 (v2).

## 4. Owner controls and reporting

All owner automation shipped in the repository remains valid. The cockpit surfaces only a subset of
controls so non-technical operators can respond quickly, while power users can continue to rely on the
scripts in `scripts/v2/` for mission bundles, change tickets, and dashboard generation:

```bash
# Snapshot the full owner configuration
npm run owner:dashboard -- --network hardhat

# Render a safe-ready change ticket
npm run owner:plan:safe -- --network hardhat
```

The UI intentionally writes salts, burn references, and proposal metadata to `localStorage` so a crash
or accidental refresh never loses context mid-run. Clearing the browser storage resets the cockpit to a
blank slate.

## 5. Continuous integration

The standard `ci.yml` workflow already lint checks, type-checks, and executes the Hardhat suites,
including `solvingAlphaGovernance.integration.test.ts`. No additional CI configuration is required –
ensure branch protection keeps that workflow mandatory.

By composing existing modules into a guided UX, this demo proves how AGI Jobs v0 (v2) empowers entire
administrations without any new on-chain logic. Non-technical teams can now stage and rehearse
superintelligent governance scenarios with the exact tools they will use in production.
