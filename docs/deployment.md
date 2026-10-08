# Deployment Notes

Start with the [current staged deployment guide](deployment-v2-agialpha.md) for the modular v2 contracts. The [production readiness record](production/readiness-2026-10-03.md) lists the external release gates that remain mandatory. Use the repository-pinned toolchain, `npm ci`, `npm run compile`, and `npm run release:check-size` before deployment.

- `scripts/v2/deployDefaults.ts`: resumable component deployment, atomic registration/wiring, and explicit governance handoff.
- `npm run deploy:oneclick`: direct-owner deployment and secure-default application; governance must be the connected deployer. Its minimum stake must be positive (one token by default) and initializes the minimum-stake floor; the configured tax URI and acknowledgement are applied at construction. Tax-disabled or Kleros variants require their separately reviewed deployment routes. Use the staged route for a multisig. One-click does not supply external workers, storage, certificate metadata, audit approval, or funded validators.
- `npm run deploy:protocol`: provider-agnostic core deployment and local job lifecycle rehearsal; inspect its [scope and handoff](deployment/provider-agnostic-deploy.md).
- `scripts/deploy-v2.ts`: preserved **local Hardhat fixture** using `ValidationStub`; public network execution is rejected.
- Truffle migrations and `docs/legacy/`: preserved historical routes; do not mix their addressbooks with current modular deployment artifacts.

`hardhat run` does not forward custom deployment flags. Pass JSON through `DEPLOY_DEFAULTS_CONFIG` and reports through `DEPLOY_DEFAULTS_OUTPUT`, as shown in the current guide.

## Mainnet ENS configuration

For a manually deployed mainnet `IdentityRegistry` without initialized ENS settings, call `configureMainnet()` to apply the canonical Ethereum mainnet ENS settings. This helper configures the ENS registry, NameWrapper, and required root nodes for `agent.agi.eth` and `club.agi.eth`.

```ts
await identityRegistry.configureMainnet();
```

The supported deployment scripts already configure ENS from the selected network configuration. Verify the resulting registry, wrapper and root nodes instead of overwriting another network’s settings with mainnet addresses. Never invoke `configureMainnet()` on a testnet solely because a generic guide mentions it.
