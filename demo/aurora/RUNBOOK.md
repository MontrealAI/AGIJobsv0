# AURORA Runbook (Operators)

## Disposable local mission

```bash
npm run demo:aurora:local
```

The launcher requires an unused loopback port and proves that it owns a fresh, unforked Anvil or Hardhat process on chain 31337. It keeps the inherited exclusive demo lock and refuses to attach to an existing node. The shared ASI takeoff launcher uses the same checks.

It selects the explicit local role template, generates a fresh campaign block anchor, and deploys a new paused stack. The creation account, unlocked local governor and treasury are separate. The runner reconciles source/initcode/runtime, creation receipts, the exact raw config and every consumed address before governor calls. It accepts IdentityRegistry/TaxPolicy handoffs and applies only the template's distinct treasury/FeePool governance fields.

Before its local pause/resume drill, it repeats the bounded readback. Only the two explicitly absent local ENS fixtures are permitted as bounded blockers. `local-authority.json` labels this disposable simulation; `authorityComplete`, `sourceVerificationComplete`, `activationReady` and `productionApproved` remain false. Explorer verification is never invented. The demo uses fixture identities/mock tokens and records validation and actual settlement separately.

Reports and governance transaction receipts are written under `reports/localhost/aurora/`. An interrupted run is not resumed on an old stack; start a fresh owned local instance and preserve its diagnostics/evidence. Do not publish private node logs, which may contain development keys.

## Public networks

`demo:aurora:sepolia` now fails closed before governor acquisition or writes. There is no development-key, simulated-ENS or source-verification shortcut for a public network. Use the [current deployment guide](../../docs/deployment-v2-agialpha.md) for separately authorized new deployments; hardware/delegated signing and complete public activation qualification remain separate requirements.
