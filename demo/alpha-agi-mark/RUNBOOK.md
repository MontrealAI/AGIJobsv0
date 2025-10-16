# α‑AGI MARK — Operator Runbook

## Local autonomous mission

```bash
npm run demo:agimark:local
```

This helper will:

1. kill any lingering Anvil node and start a fresh instance;
2. deploy v2 defaults with `DEPLOY_DEFAULTS_OUTPUT=reports/localhost/agimark/deploy.json`;
3. execute `cli/mark.demo.ts` to mint funds, post a foresight market, stake
   agents/validators, run commit→reveal, and finalize payouts;
4. render `mission.md` plus JSON receipts under `reports/localhost/agimark/`.

All transactions use the Hardhat default keys bundled with Anvil; no secrets are
required.

## Browser console (wallet UX)

```bash
cd demo/alpha-agi-mark/webapp
npm ci
npm run dev
```

* Connect via MetaMask/Anvil.
* “Create Market” pins the prompt to IPFS (HTTP API configurable by `.env`).
* Validators commit/reveal with one click once stakes are deposited.
* Owner panel exposes pause + thermostat (scripted to call the repo’s owner
  helpers; production execution routed through a Safe/multisig).

## Testnet / mainnet dry-runs

Set the appropriate RPC + keys, then run:

```bash
RPC_URL=https://sepolia.example PRIVATE_KEY=0xabc... \
  DEPLOY_DEFAULTS_OUTPUT=reports/sepolia/agimark/deploy.json \
  npx hardhat run scripts/v2/deployDefaults.ts --network sepolia

NETWORK=sepolia RPC_URL=... PRIVATE_KEY=... \
  ts-node --transpile-only demo/alpha-agi-mark/cli/mark.demo.ts --network sepolia
```

For mainnet, **never** call the deploy or demo scripts without the explicit
`MAINNET_ACK=I_KNOW_WHAT_I_AM_DOING` environment flag. The provided
`scripts/deploy.mainnet.mark.ts` performs a dry-run and echoes the execution plan
only when the acknowledgement is present.

## Owner controls & safety

* `npm run owner:verify-control` – confirm the configured owner can pause,
  update fees, or rotate governance.
* `scripts/v2/updateThermodynamics.ts` – tune thermostat values (run with
  `--dry-run` before broadcasting).
* Emergency pause is exposed in both CLI + UI via `SystemPause` (wired into the
  default deployment).

## Reporting artifacts

* `reports/<network>/agimark/deploy.json` – address book from deployDefaults.
* `reports/<network>/agimark/mission.md` – human-readable recap.
* `reports/<network>/agimark/receipts/*.json` – raw transaction receipts.

CI preserves these as GitHub Action artifacts for auditability.
