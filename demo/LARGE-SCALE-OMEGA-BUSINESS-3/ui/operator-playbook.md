# Omega-Grade Operator Playbook

This playbook mirrors the guided workflow triggered by `npm run demo:omega-business-3`. Run the orchestrator once before following these steps so ENS labels, IPFS references, and report directories exist.

## 1. Launch the conversational stack

```bash
npm run demo:omega-business-3:ui
```

- Connect MetaMask (Hardhat default wallet locally, or your production account on mainnet).
- Confirm the banner shows `omega-business.eth` as the active ENS root.

## 2. Publish Solaris Continuum's mission

1. Click **Launch Conversational Job Creator** in the Enterprise Portal.
2. Supply the following prompts:
   - **Title:** _Heliostat Free-Energy Transmutation_
   - **Description:** _Coordinate orbital AGI fleets to convert heliostat telemetry into autonomous infrastructure credits._
   - **Reward:** `150000`
   - **Deadline:** `72` hours
   - **Skills:** `energy-markets, orbital-ai, treasury-automation`
   - **Validators:** `Horizon Arbitration Collective`
3. Upload any supporting documents. The portal automatically pins them to IPFS using the repository’s built-in tooling.
4. Approve the transaction in your wallet. The UI streams every phase of the job lifecycle.

## 3. Observe validator and treasury flows

- `http://localhost:3002` – Validator Dashboard shows Horizon and Atlas commits, reveals, and dispute windows.
- `http://localhost:3000` – Owner Console exposes pause toggles, validation windows, and treasury routing parameters.
- `http://localhost:3001` – Enterprise Portal chat summarises the job, receipts, and payout readiness.

## 4. Exercise owner authority (read-only)

Run the following from a terminal to prove the owner retains full command:

```bash
npm run owner:command-center -- --network hardhat --format human --no-mermaid
npm run owner:surface -- --network hardhat --format human
```

Both commands are safe and read-only. They confirm every module remains pausable and configurable.

## 5. Finalize and document

When Horizon Arbitration Collective approves the submission:

1. Use the Enterprise Portal **Finalize** action or rerun the deterministic test harness:
   ```bash
   npx hardhat test test/demo/omegaBusinessSimulation.test.ts --grep "finalizes"
   ```
2. Confirm the agent wallet receives funds minus protocol burns.
3. Review `reports/omega-business-3/mission-summary.md` and `simulation-ledger.ndjson` for immutable records.

You now have a first-class, owner-governed Omega-grade showcase built entirely from production components.
