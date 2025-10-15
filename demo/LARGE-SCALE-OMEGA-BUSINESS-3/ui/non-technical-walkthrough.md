# Omega-Grade User Walkthrough (Non-Technical Edition)

This playbook assumes you have already run `npm install` at the root of the repository and want a frictionless, wallet-first showcase of the Omega-grade demo.

---

## 1. Launch the UI constellation

```bash
npm run demo:omega-business-3:ui
```

The helper script now boots all three first-class interfaces at once:

| Interface | URL | Purpose |
|-----------|-----|---------|
| Owner Console | http://localhost:3000 | Pause/unpause modules, retune commit/reveal windows, inspect governance health. |
| Enterprise Portal | http://localhost:3001 | Post jobs as a nation persona, review live job status, trigger payouts. |
| Validator Desk | http://localhost:3002 | Track commit/reveal timers, validator assignments, and dispute readiness. |

The services run until you press **Ctrl+C** in the terminal. Logs are streamed to `/tmp/omega-owner-console.log`, `/tmp/omega-enterprise-portal.log`, and `/tmp/omega-validator-ui.log` so operators can share transcripts with auditors.

---

## 2. Connect any wallet (local or mainnet)

Each interface speaks directly to Ethereum through the same ABI packages already shipping with AGI Jobs v0 (v2). When the browser prompts you to connect a wallet, you can:

- Use Hardhat’s default accounts on a local fork for rehearsal.
- Connect a Safe, Ledger, or MetaMask wallet on production networks.
- Toggle read-only mode if you simply want to observe the simulation.

All transactions are user-signed; the repo never holds private keys.

---

## 3. Play as a nation persona

Inside the **Enterprise Portal**, pick any of the pre-seeded personas (Solaris Continuum, Arctic Quantum Accord, Celestial Silk Road Coalition). The UI pre-fills:

1. Reward budget (denominated in AGI ALPHA).
2. Mission statement and job metadata URI.
3. Suggested validator guilds.

You can edit every field before submitting. When you post the job, MetaMask (or your wallet) pops up with the prepared `JobRegistry.createJob` transaction. Confirm and watch the job land on-chain.

---

## 4. Observe validator and treasury behaviour

Switch to the **Validator Desk** to watch commits, reveals, burns, and payouts. The panel reads directly from the subgraph plus the existing validator simulation harness, so you immediately see which wallet-controlled entities are working the job.

The **Owner Console** shows live parameter tables, treasury routing, and pause toggles. Every change emits the `ParameterUpdated` events already indexed by the repo’s monitoring stack, keeping auditors happy.

---

## 5. Shut everything down cleanly

When you are finished, press **Ctrl+C** in the terminal that launched the demo. The helper script terminates each UI gracefully. You can forward the log files under `/tmp/` to stakeholders for a verifiable record of the session.

---

By combining the existing consoles into a single launch command, non-technical operators gain an immediate, production-grade window into the Omega-grade scenario—no Docker, no hidden scripts, just wallet clicks and on-chain proof.
