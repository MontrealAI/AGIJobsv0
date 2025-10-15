# Solving α‑AGI Governance Demonstration

This runbook assembles a fully owner-governed governance rehearsal for AGI Jobs v0 (v2) using only
components that already ship in this repository.  It intentionally stays within the
**existing production toolchain** so that the flow can be replayed against a fork, a public testnet, or
Ethereum mainnet with no code changes.

The demonstration mirrors the "Solving α‑AGI Governance" storyline: multiple nation-scale actors table
sovereign policy proposals, wallet-controlled validators arbitrate those proposals through the
commit–reveal pipeline, and the contract owner steers every dial (pausing, quorum thresholds, stake
levels) in real time.  No Solidity changes are required; everything rides on the audited v2 protocol.

> ✅ _Target audience_: non-technical owners and policy staff who only have access to a browser wallet and
> the standard AGI Jobs owner scripts.

## 1. Prepare the workspace

1. Install dependencies once: `npm install`.
2. Ensure the canonical AGIALPHA token address is funded on the target network.  For local Hardhat
   rehearsals, the standard deploy scripts inject the mock bytecode automatically.
3. Export the deployment configuration you wish to reuse.  For example, to regenerate the secure
   defaults bundle: `npm run deploy:checklist -- --network hardhat`.

All subsequent steps use the contract addresses recorded by the existing deployment automation in
`deployment-config/generated/` or `deployment-config/latest-deployment.<network>.json`.

## 2. Launch the owner command surface

Run the curated owner quickstart to populate every adjustable governance control in one shot:

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/ownerControlQuickstart.ts \
  --network hardhat \
  --config deployment-config/mainnet.json
```

This produces:

* an **Owner Dashboard** (Markdown + JSON) enumerating the current parameters across JobRegistry,
  StakeManager, ValidationModule, IdentityRegistry, FeePool, and TaxPolicy;
* a **Mission Bundle** with transaction payloads for pausing/unpausing, quorum adjustments, validator
  staking thresholds, dispute fees, and reward/penalty routing; and
* a ready-to-sign change ticket for governance archives.

Non-technical operators only need to copy/paste the generated JSON into their preferred multisig or
safe; every call uses existing ABI definitions.

## 3. Spin up the civic UI

1. `cd apps/onebox`
2. Create a `.env.local` with your orchestrator endpoint (or leave it empty to operate in offline
   receipt mode):
   ```bash
   NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL=http://127.0.0.1:8787
   NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_TOKEN=demo
   ```
3. Start the interface: `npm run dev`.
4. Connect any browser wallet.

The landing page now renders **two coordinated surfaces**:

* the familiar Onebox chat for orchestrator requests, plan simulation, and execution receipts; and
* the new **Solving α‑AGI Governance cockpit**.  The cockpit lets non-technical operators:
  * register nation sponsors, validators, and owner wallets (with readiness indicators and
    connectivity toggles);
  * configure all proposal parameters (reward pool, quorum, staking thresholds, commit/reveal windows,
    dispute window, and specification URI);
  * copy milestone-specific prompts for proposal creation, validator commit, validator reveal,
    finalisation, and owner oversight; and
  * grab the pre-wired owner command deck (pause, update-all, mission control) without leaving the UI.

Every control writes to `localStorage`, so refreshes or browser crashes preserve state for rehearsals.
The chat window consumes the copied prompts verbatim—no bespoke APIs or forks required.

## 4. Simulate nation-scale proposals

Use the existing `test/v2` helpers to fast-forward a multi-actor scenario on a fork or Hardhat.  The
UI prompts reference these exact flows, so the rehearsals mirror production:

```bash
npx hardhat test test/v2/solvingAlphaGovernance.integration.test.ts
```

The integration fixture deploys the production contracts, onboards multiple nation sponsors, and walks
through the commit–reveal validation cycle twice—first under the default quorum and then again after the
owner tightens approvals and pauses/unpauses the registry.  Replaying it against a forked mainnet
snapshot proves the flow stays green under live conditions.

## 5. Showcase wallet-controlled validators

Leverage the shipped validator CLI (`scripts/validator/cli.ts`) to perform commits and reveals from
plain wallets:

```bash
npm run validator:cli -- commit --job-id 1 --label validator-a --approve --rpc http://127.0.0.1:8545
```

Generate validator identities ahead of time with
`npm run validator:cli -- identity generate validator-a --ens validator-a.club.agi.eth`.  The reveal
stage swaps `commit` for `reveal --approve` and reuses the stored salts that the cockpit reminds each
validator to preserve.  These commands are fully scriptable, letting you pre-record validator
participation for demonstrations.

## 6. Keep owner control front and centre

* Pause or resume the entire marketplace via `npm run owner:system-pause -- --pause true`.
* Re-issue protocol parameters at any time using the generated mission bundle from step 2.
* Verify that ownership has not drifted by running `npm run owner:verify-control`.

Every owner command is read-only until the operator intentionally signs the transaction; this preserves
clear separation between rehearsals and production execution.

## 7. Export artefacts for stakeholders

* `reports/owner/` — automatically updated dashboards and change tickets.
* `apps/onebox/.next/cache/` — contains the chat transcript, validation receipts, and execution logs
  that can be shared with policy teams.
* `reports/test-results/` — populated when CI (see below) runs the governance integration suite.

These assets illustrate how AGI Jobs v0 (v2) empowers entire administrations without demanding any new
code deployments.

## 8. CI: keep the pipeline green

The standard `ci.yml` workflow already executes linting, type-checking, contract unit tests, and the
critical integration suites (including the governance pathways above).  Ensure branch protection
requires that workflow to pass before merges—no extra YAML is needed.

---

By chaining together the existing deployment automation, owner tooling, validator CLI, and Onebox
interface, this demonstration delivers a nation-scale, owner-controlled governance experience today.
No new smart contracts, no bespoke APIs—just disciplined orchestration of the platform that already
ships in this repository.
