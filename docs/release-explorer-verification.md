# Explorer Verification Automation

This guide explains how the GitHub Actions release workflow automatically
verifies AGI Jobs v0 (v2) contracts on Etherscan/Blockscout. It complements
the institutional deployment readiness punch-list by ensuring every release
produces public, reproducible source verification evidence.

## Workflow overview

1. `release.yml` compiles contracts, regenerates TypeChain artefacts, builds
the release manifest, and publishes an SBOM.
2. The new **Verify deployed contracts** job downloads the manifest, resolves
   deployed addresses, and executes
   `scripts/release/run-etherscan-verification.js` for the selected network.
3. The script determines the correct API key from repository/organization
   secrets (`ETHERSCAN_API_KEY_<NETWORK>` or `ETHERSCAN_API_KEY`), prepares
   constructor argument bundles, and calls `npx hardhat verify --no-compile`
   for each module listed in the verification plan.
4. A JSON summary is uploaded as `release-verification` for auditors. It
   captures the explorer name, API credential source, and verification status
   for each contract (verified, already verified, skipped, or failed).

## Configuring networks

Verification plans live in `deployment-config/verification/`:

- `mainnet.json` targets Ethereum mainnet via Etherscan.
- `sepolia.json` targets the Sepolia testnet.
- `schema.json` documents the configuration format.

Each plan contains a `contracts` array mapping human-readable names to the
fully qualified contract identifiers expected by Hardhat. Addresses are pulled
from the release manifest (`reports/release/manifest.json`). If you need to
override an address, set `"address"` or `"addressSource"` on the relevant
contract entry.

Populate constructor arguments under
`deployment-config/verification/args/<network>/`. For example, the mainnet
StakeManager arguments live in
`deployment-config/verification/args/mainnet/stake-manager.js`. Each file
exports a JavaScript array compatible with Hardhat's `--constructor-args`
flag. Comments are allowed so you can annotate each parameter.

When new modules are introduced, add a new entry to the verification plan and
create the corresponding constructor args file. Update
`deployment-config/verification/schema.json` if additional metadata fields are
required.

## Secrets and OIDC policy

Store explorer API keys in the repository, environment, or organization
secrets. The workflow checks the following environment variables (in order):

1. `ETHERSCAN_API_KEY_<NETWORK>` — e.g. `ETHERSCAN_API_KEY_MAINNET`.
2. `ETHERSCAN_API_KEY` — fallback shared key.

Use GitHub's OIDC integration with your secrets manager to mint short-lived
API keys on demand. Document the provisioning policy in your operations runbook
so the incident commander can rotate credentials quickly. The verification job
fails fast when no API key is available, preventing unsigned releases from
reaching production unnoticed.

## Dry-run before tagging

To validate the configuration before cutting a tag, run:

```bash
node scripts/release/run-etherscan-verification.js --network mainnet --dry-run
node scripts/release/run-etherscan-verification.js --network sepolia --dry-run
```

The dry-run prints the exact Hardhat commands without hitting the explorer.
Once addresses and constructor arguments are in place, remove `--dry-run` to
perform an end-to-end verification rehearsal using a disposable API key.

## Troubleshooting

- **Missing manifest warnings** – the script depends on
  `reports/release/manifest.json`. Re-run `npm run release:manifest` before
  invoking the verifier.
- **Address unresolved** – ensure `docs/deployment-addresses.json` and
  `docs/deployment-summary.json` include the contract address. The script skips
  zero addresses to avoid false positives.
- **Constructor mismatch** – update the args file for the affected contract.
  Hardhat will emit the expected constructor signature in the failure output.
- **Already verified** – the command reports `already_verified` but exits
  successfully. The summary still records the contract to provide an audit
  trail.

With these controls wired into CI, every tagged release automatically produces
verifiable source metadata, satisfying the "Best-ever" institutional readiness
requirements.
