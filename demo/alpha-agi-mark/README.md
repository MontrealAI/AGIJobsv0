# α-AGI MARK 🔮🌌✨ Demo

The **α-AGI MARK demo** shows how a non-technical operator can wield AGI Jobs v0 (v2) to deploy a validator-gated bonding curve, finance a foresight NFT, and launch the sovereign vault that receives the funds. A single command stands up:

- An ERC-721 Nova-Seed representing the foresight insight.
- The `AlphaAgiMark` market-maker that mints Seed Shares along a linear bonding curve, enforces compliance guardrails, and exposes full owner control.
- A council-driven risk oracle that must approve the launch before funds are released.
- A Sovereign Vault that collects the proceeds once the seed is "green-flamed".

Everything runs locally via Hardhat but mirrors mainnet-grade controls: pausing, whitelists, validator rotation, and owner overrides are all live.

## Quickstart

```bash
# 1. Ensure dependencies (from repo root)
npm install

# 2. Run the full demo (compilation + scripted orchestration)
npm run demo:alpha-agi-mark

# 3. Execute the unit test suite dedicated to the demo
npm run test:alpha-agi-mark
```

The demo stream prints every step—purchases, validator approvals, pause toggles, and the final launch summary. Logs land under `reports/demo-alpha-agi-mark/demo-run.log` for audit retention.

## Components

| Component | File | Description |
| --- | --- | --- |
| Nova-Seed foresight NFT | [`contracts/NovaSeedNFT.sol`](./contracts/NovaSeedNFT.sol) | Mint-once ERC-721 with owner-controlled metadata. |
| α-AGI MARK market-maker | [`contracts/AlphaAgiMark.sol`](./contracts/AlphaAgiMark.sol) | Bonding-curve ERC-20, validator oracle, compliance levers, and launch finalisation all in one governance-supreme contract. |
| Sovereign vault | [`contracts/SovereignVault.sol`](./contracts/SovereignVault.sol) | Receives launch proceeds and allows the owner to sweep or update the mandate. |
| Hardhat config | [`hardhat.config.ts`](./hardhat.config.ts) | Self-contained configuration so the demo compiles and tests independently. |
| Scripted orchestration | [`scripts/runDemo.ts`](./scripts/runDemo.ts) | Step-by-step scenario that a non-technical user can execute. |
| Unit tests | [`test/AlphaAgiMark.test.ts`](./test/AlphaAgiMark.test.ts) | Validates bonding-curve maths, whitelist compliance, validator gating, aborts, and emergency overrides. |

## Owner Control Matrix Snapshot

Running `npm run demo:alpha-agi-mark` prints a JSON table summarising all live controls:

- `paused` – current pause state (owner toggles via `pauseMarket`/`unpauseMarket`).
- `whitelistEnabled` and entries – compliance gating with batch updates.
- `validatorThreshold` & `approvals` – validator council consensus with dynamic rotation.
- `seedValidated` / `launchFinalised` – lifecycle stages.
- `sovereignVault` – live destination for reserves.
- `reserveBalance` / `totalSupply` – financial snapshot for audits.

This is a non-interactive audit artefact proving the owner’s supremacy at every step.

## CI Integration

A dedicated workflow (`.github/workflows/demo-alpha-agi-mark.yml`) ensures the demo compiles, tests, and runs end-to-end on every pull request and on `main`. Branch protection can require the `demo-alpha-agi-mark` status to keep the pipeline **fully green**.

## Extending Toward Mainnet

- Swap the Hardhat network for Sepolia or mainnet by passing `--network` to Hardhat after configuring RPC credentials.
- Adjust the bonding curve (`setCurveParameters`) before issuing shares to tune pricing for a specific seed.
- Rotate validators and thresholds via `setValidator` and `setValidatorThreshold` to adapt governance as the council expands.
- Use `abortLaunch` to pause fundraising instantly while still allowing investors to redeem.

With these controls, α-AGI MARK behaves exactly like the superintelligent foresight market-maker envisioned by the AGI Jobs initiative—deployable by anyone with a single command.
