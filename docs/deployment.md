# Deployment Notes

Start with the [current staged deployment guide](deployment-v2-agialpha.md) for the modular v2 contracts. The [production readiness record](production/readiness.md) lists the external release gates that remain mandatory. Use the repository-pinned toolchain, `npm ci`, `npm run compile`, and `npm run release:check-size` before deployment.

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

## Match the service and browser networks

The one-click addressbook records its network and observed chain ID. `deploy:env` uses those values for `AGJ_NETWORK`, `CHAIN_ID` and `NEXT_PUBLIC_CHAIN_ID`; older addressbooks require an explicit `--network` matching the reviewed deployment. An explicitly requested missing addressbook fails rather than falling back to another deployment.

For public networks, configure **both** `RPC_URL` (private server endpoint) and `NEXT_PUBLIC_RPC_URL` (separately approved, browser-published endpoint) in the environment file before running the wizard. Both must be literal HTTPS URLs; local Anvil defaults are rejected. The wizard checks each endpoint’s chain before deployment and verifies the deployed JobRegistry before launching Compose. It never derives the browser URL from a private server URL or prints endpoint credentials. Browser configuration is public and requires an image rebuild when changed.

For local rehearsals, Docker’s `http://anvil:8545` and the browser’s `http://localhost:8545` remain distinct, with chain ID 31337. The host cannot validate Docker’s internal DNS before the stack exists, so public-network RPC verification does not run for that local fixture. The Compose launch uses the checked routing/address settings and clears conflicting inherited shell values.
