# Release checklist

Use this list before tagging a new production release.

1. **Compile and lint**
   ```bash
   npm run compile
   npm run lint:check       # runs solhint + eslint with zero warnings
   npm run format:check     # prettier guardrails
   ```
2. **Run tests and enforce coverage**
   ```bash
   npm test
   npm run coverage:full
   node scripts/check-coverage.js 90
   forge test --ffi
   ```
3. **Run fuzzing & invariants**
   ```bash
   npm run echidna
   npm run echidna:commit-reveal   # deterministic seed for reproducibility
   ```
4. **Static analysis**
   ```bash
   docker run --rm -u root -v "$PWD":/src -w /src "$SLITHER_IMAGE" slither . --fail-high --exclude-dependencies \
     --compile-force-framework solc --solc-remaps '@openzeppelin=node_modules/@openzeppelin' \
     --solc-args '--base-path . --include-path node_modules --allow-paths .,node_modules' --sarif results.sarif
   ```
   - Upload `results.sarif` to GitHub code scanning if new issues are introduced.
   - Optional: run MythX when credentials are configured.
5. **Generate ABI docs and gas reports**
   ```bash
   forge doc || npx hardhat docgen
   npm run gas:snapshot || npx hardhat test --report-gas
   ```
6. **Run fork & testnet drills**
   ```bash
   export MAINNET_RPC_URL="https://mainnet.example"
   npm run test:fork
   npx hardhat run scripts/deploy/providerAgnosticDeploy.ts --network sepolia
   npx hardhat run scripts/audit/drills/validator-misbehaves.ts --network hardhat
   ```
   - Archive logs under `internal_docs/security/drills/`.
   - Store `gas-snapshots/*.json` produced during the fork.
7. **Update deployment addresses**
   - Fill `scripts/etherscan/addresses.json` with final contract addresses.
8. **Create Etherscan call plan**
   ```bash
   node scripts/etherscan/generate_calls.js > scripts/etherscan/calls.json
   ```
9. **Transfer ownership to governance**
   - Use the calls file as a guide for final `setGovernance` or `transferOwnership` transactions.

10. **Final production checks**
    - Confirm `$AGIALPHA` exposes a public `burn` and that fee burning reduces total supply.
    - Run an employer‑initiated burn through `FeePool.distributeFees` and verify the burn receipt.
    - Ensure all entry points enforcing `TaxPolicy` acknowledgement are covered by tests.
    - Verify ENS subdomain ownership for a sample agent and validator including NameWrapper fallback and Merkle bypass.
    - Double‑check slashing parameters (`employerSlashPct`, `treasurySlashPct`, validator rewards) for rational incentives.
    - Review emitted events for job lifecycle, staking changes and policy updates to guarantee on‑chain traceability.
    - Re‑read deployment and user guides to confirm they match the final code and address list.
    - Ensure GitHub branch protection marks the `build`, `slither`, `coverage`, `echidna`, and `gas-snapshot` workflows as required checks.
    - Confirm mainnet deployment dry-run (`npm run migrate:wizard -- --network mainnet`) succeeded at least once with pinned block numbers.
    - Package audit artefacts (coverage HTML, Slither SARIF, Echidna logs, fork drill outputs) for hand-off.

11. **Sign and verify the release tag**
    - Follow the [release tag signing playbook](release-tag-signing.md) to create an annotated, signed `vX.Y.Z` tag.
    - Run `git tag -v vX.Y.Z` (SSH: configure `ssh-keygen -Y import`; GPG: import the ASCII-armored key) and capture the output in the release ticket.
    - Confirm the release workflow's **Require signed release tag** step succeeded and that GitHub shows the **Verified** badge on the tag page.

Tick each item to ensure deployments remain reproducible and auditable.
