# Your first five minutes with Omega

This is a local demonstration of how computer-capable agents can take on business work while people retain acceptance and payment authority. You can explore it without a wallet, an AI subscription or deployment credentials.

## 1. Open the command theatre

Ask your technical teammate to check out the repository and use its pinned Node version. In the repository folder, run:

```bash
npm run demo:omega-business-3:ui
```

Open the printed URL, normally **http://127.0.0.1:4186**. The dashboard generates a fresh synthetic run. It has an **FR / EN** language button, keyboard-accessible mission cards and a phone-friendly layout. Synthetic source text and original mission names remain in their source language.

The green label means the page is a **local synthetic rehearsal**. It does not mean an AI worked, a human accepted the result or a payment happened.

## 2. Choose a nation

- **Solaris Continuum:** inspect energy production minus consumption. The net result is 6,900 kWh, with a 700 kWh deficit in one array.
- **Arctic Quantum Accord:** reconcile stock against commitments and reserves. The result includes a 30-unit shortage even though other locations have spare stock.
- **Celestial Silk Road Coalition:** compare supplier quotes and delivery times. Stellar wins at 490 USDC; the cheaper late offer is excluded.

Select any card to inspect its proposed budget and download the **Source input**, **Agent task**, **Candidate JSON**, **Dossier** and **Checker verdict**. These are real local files. Their contents are synthetic.

## 3. Ask “does the result meet the brief?”

“Checks passed” means the independent arithmetic checker reproduced the quantities and decision rules. It is still your job, or an independent reviewer's job, to assess the sources, explanation, rights, exceptions and actual application state.

The budget table separates the proposed customer budget, assumed worker cost, assumed review cost, assumed fee and unallocated budget. None of those entries is a real payment or measured provider bill. The original mock-token rewards are separate from these USDC planning amounts.

Move the **review minutes** slider. It previews how many jobs fit within your capacity. It does not alter the saved run, approve work or contact an agent. A new CLI run with `--review-capacity 10` actually records the corresponding admission decisions.

## 4. Hand a bounded task to a real agent

Download **Agent task** and **Source input**. Follow the [computer-work guide](../computer-work/README.md) with a technical operator to commission OpenClaw, or open an operator-led ChatGPT Work session with a dedicated environment and approved app access. Ask for the specified JSON candidate and Markdown dossier.

Keep the original source file unchanged. Give the returned candidate to the separate checker, then arrange independent human review. The dashboard has no “approve and pay” shortcut. A separately authorized signer handles any later settlement through the configured production workflow.

## 5. Keep the evidence and stop

Download the complete `report.json` and mission ledger, or keep the run directory printed in your terminal. Each file's SHA-256 can be checked using the verifier in the README. Local files can be changed; archive the original digest and directory through your normal evidence process.

Press **Ctrl+C** in the terminal to stop the server. The evidence files remain.

| If you see…                                   | Do this                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| “Port already in use” / `EADDRINUSE`          | Stop the earlier dashboard or run `npm run demo:omega-business-3:ui -- --port 4187`. New tasks use that port.               |
| A deferred mission                            | Inspect its capacity or budget reason; rerun with a reviewed scenario or more review capacity.                              |
| A rejected candidate                          | Keep the evidence; correct the work and run a separate check. The demo's `--inject-error` intentionally creates this state. |
| A download integrity error                    | Stop and verify the original report directory; do not treat changed files as the original evidence.                         |
| Missing dependencies in `--stack` or `--full` | Those advanced paths need repository/app setup; the default dashboard and rehearsal need only Node.                         |

For the separate wallet-connected applications and production commissioning, use the [operator playbook](operator-playbook.md). Do not connect real funds just to explore this local dashboard.
