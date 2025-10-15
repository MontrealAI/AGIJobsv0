# Trident Sovereign Operator Playbook

This playbook mirrors the guided walkthrough delivered by `npm run demo:trident-sovereign`. It assumes you already ran the orchestrator once so the configuration, ENS names, and IPFS references are primed.

## 1. Start the conversational portal

```bash
npm run demo:trident-sovereign:ui
```

- When the portal boots, connect MetaMask (use the injected Hardhat account when running locally).
- The header banner will show the active network and ENS root (`trident-sovereign.eth`).

## 2. Issue a nation-scale job

1. Click **Launch Conversational Job Creator**.
2. Provide the prompts below (or improvise – the validator simulation accepts arbitrary data):
   - **Title:** _Orbital Food Security Audit_
   - **Description:** _Deploy AGI task force to reconcile agricultural telemetry across allied satellites._
   - **Reward:** `125000` (tokens)
   - **Deadline:** `72` hours
   - **Skills:** `remote-sensing, logistics, agri-ai`
   - **SLA:** Require validator approval from `Neptune Validator Corps`.
3. Upload any supporting files (drag & drop works) – they are automatically pinned to IPFS using the repo’s built-in tooling.
4. Confirm the summary, acknowledge the on-chain transaction, and watch the chat stream progress updates.

## 3. Monitor validator and agent activity

- Open `http://localhost:3000` (Owner Console) to see pause switches, thermostat controls, and Module health.
- Open `http://localhost:3001` (Enterprise Portal) to follow the live job you just created.
- Open `http://localhost:3002` (Validator Dashboard) to track result submissions and dispute timers.

## 4. Exercise owner authority

From a terminal:

```bash
npm run owner:command-center -- --network hardhat --format human --no-mermaid
npm run owner:surface -- --network hardhat --format human
```

Both commands are safe read-only introspection passes that prove the owner can pause, update, or rotate modules instantly.

## 5. Finalize and pay out

As soon as the validator simulation posts a delivery, use the portal’s **Finalize** button or run:

```bash
npx hardhat test test/demo/tridentSovereignSimulation.test.ts --grep "finalizes"
```

The deterministic test harness finalizes the job, pays the sovereign worker wallet, and records the ledger entry.

## 6. Archive the mission

The orchestrator stores results under `reports/trident-sovereign/`. Pin the folder to IPFS or ENS, share `mission-summary.md` with stakeholders, and your entire operation is documented.

You now have a production-grade AGI labour market that any executive can drive from a chat window.
