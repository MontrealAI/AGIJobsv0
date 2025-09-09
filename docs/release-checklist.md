# Release checklist

Use this list before tagging a new production release.

1. **Compile and lint**
   ```bash
   npm run compile
   npm run lint
   ```
2. **Run tests**
   ```bash
   npm test
   ```
3. **Generate ABI docs and gas reports**
   ```bash
   forge doc || npx hardhat docgen
   forge snapshot || npx hardhat test --report-gas
   ```
4. **Update deployment addresses**
   - Fill `scripts/etherscan/addresses.json` with final contract addresses.
5. **Create Etherscan call plan**
   ```bash
   node scripts/etherscan/generate_calls.js > scripts/etherscan/calls.json
   ```
6. **Transfer ownership to governance**
   - Use the calls file as a guide for final `setGovernance` or `transferOwnership` transactions.

7. **Final production checks**
   - Confirm `$AGIALPHA` exposes a public `burn` and that fee burning reduces total supply.
   - Run an employer‑initiated burn through `FeePool.distributeFees` and verify the burn receipt.
   - Ensure all entry points enforcing `TaxPolicy` acknowledgement are covered by tests.
   - Verify ENS subdomain ownership for a sample agent and validator including NameWrapper fallback and Merkle bypass.
   - Double‑check slashing parameters (`employerSlashPct`, `treasurySlashPct`, validator rewards) for rational incentives.
   - Review emitted events for job lifecycle, staking changes and policy updates to guarantee on‑chain traceability.
   - Re‑read deployment and user guides to confirm they match the final code and address list.

Tick each item to ensure deployments remain reproducible and auditable.
