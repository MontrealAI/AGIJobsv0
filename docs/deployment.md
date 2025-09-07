# Deployment Notes

After deploying the `IdentityRegistry` contract, you must call `configureMainnet()` to apply the canonical Ethereum mainnet ENS settings. This helper configures the ENS registry, NameWrapper, and required root nodes for `agent.agi.eth` and `club.agi.eth`.

```ts
await identityRegistry.configureMainnet();
```

Without this step, the registry will not enforce the proper mainnet ENS identity rules.
