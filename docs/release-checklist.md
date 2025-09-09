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

Tick each item to ensure deployments remain reproducible and auditable.
