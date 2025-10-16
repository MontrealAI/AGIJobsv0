# RUNBOOK — META‑AGENTIC‑BAZAAR

## Local testnet (non‑technical)
1) At repo root: `npm ci`
2) Run: `npm run demo:meta:local`
3) In another terminal: `npm run demo:meta:ui` then open http://localhost:5173
4) Click **Connect Wallet** (Hardhat account via MetaMask), type a task, **Post job**
5) Watch the **Job feed** update; use **Owner Panel** → Pause/Unpause to see governance control

## Where addresses come from?
- The local script writes `reports/localhost/meta-agentic-bazaar/addresses.json` (auto).
- If not, paste addresses in the Owner Panel (saved to browser storage).

## Mainnet (guarded)
- Dry-run plan: `CONFIRM=false npx ts-node demo/META-AGENTIC-BAZAAR/scripts/deploy.mainnet.plan.ts`
- If approved, set `CONFIRM=true` and run with a hardware wallet & multisig policies.

## Artifacts
- Deterministic receipts & `mission-report.md` in `reports/localhost/meta-agentic-bazaar/`
- Mermaid diagrams under `demo/META-AGENTIC-BAZAAR/mermaid/`
