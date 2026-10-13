# Explorer Verification Automation

This guide describes explorer verification in the signed `v*` production release
workflow (`.github/workflows/release.yml`). Its signing, qualification and
commissioning requirements remain in force; a tag alone does not establish
successful source verification or production readiness.

The separate `source-v*` publisher archives source and dated evidence. It sends
no explorer submission or blockchain transaction and does not run this production
verification workflow. Keep existing deployments tied to their original source,
compiler input and constructor arguments; see the [compiler warning and historical
verification guide](production/compiler-warnings-2026-10-13.md).

## Workflow overview

1. The signed `v*` production workflow in `release.yml` compiles contracts, regenerates TypeChain artefacts, builds
   the release manifest, and publishes an SBOM.
2. The **Verify deployed contracts** job downloads the manifest, resolves
   deployed addresses, and executes
   `scripts/release/run-etherscan-verification.js` for the selected network.
3. The script determines the correct API key, preferring the short-lived
   credentials fetched from AWS Secrets Manager via GitHub OIDC and falling
   back to repository/organization secrets (`ETHERSCAN_API_KEY_<NETWORK>` or
   `ETHERSCAN_API_KEY`). It then prepares
   constructor argument bundles, and calls `npx hardhat verify`
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

Provision explorer API keys in your secrets manager and expose them to the
workflow through the following variables:

- `AWS_ETHERSCAN_ROLE_ARN` / `AWS_ETHERSCAN_REGION` – IAM role parameters used
  to mint temporary credentials via GitHub OIDC.
- `AWS_ETHERSCAN_SECRET_NAME` – Secrets Manager identifier that stores the API
  key or a JSON object containing per-network keys.
- `AWS_ETHERSCAN_SECRET_JSON_KEY` _(optional)_ – selector when the secret holds
  multiple credential sets.

When these values are present, the release workflow loads the secret at runtime
and exports `ETHERSCAN_API_KEY`, `ETHERSCAN_API_KEY_MAINNET`, and
`ETHERSCAN_API_KEY_SEPOLIA` for the verification step. If the AWS configuration
is omitted, the workflow falls back to repository/environment secrets with the
same names.

Document the provisioning policy in your operations runbook so the incident
commander can rotate credentials quickly. The verification job fails fast when
no API key is available. Signing and production readiness are separate gates;
explorer credentials do not authorize a release or a chain transaction.

## Dry-run before tagging

To validate the configuration before cutting a tag, run:

```bash
node scripts/release/run-etherscan-verification.js --network mainnet --dry-run
node scripts/release/run-etherscan-verification.js --network sepolia --dry-run
```

The dry-run prints the exact Hardhat commands without hitting the explorer.
Once addresses and constructor arguments are in place, remove `--dry-run` to
perform an end-to-end verification rehearsal using a disposable API key.

## Preserve the original compiler inputs

Follow the [compiler and verification guide](production/compiler-warnings-2026-10-13.md) before deployment. Public staged deployments save a checksummed verification bundle before the first transaction. Keep this bundle with the deployment journal. For manual export, run `node scripts/deploy/archive-verification.cjs --output reports/new-verification-bundle` after compiling. The output directory must not already exist.

The bundled Standard JSON retains the entire original input, including source files that a guessed dependency closure could miss. Use its compiler version and the journal's original ABI-encoded constructor arguments. A new compiler build cannot verify bytecode deployed from an older release.

## Troubleshooting

- **Missing manifest warnings** – the script depends on
  `reports/release/manifest.json`. Re-run `npm run release:manifest` before
  invoking the verifier.
- **Address unresolved** – inspect the selected manifest and verification plan
  against the explicit reviewed `docs/deployment-addresses.mainnet.json` inventory
  for chain 1. Use a reviewed deployment-specific manifest or an explicit plan
  address/`addressSource` override for the correct network. Generic
  `docs/deployment-addresses.json` defaults intentionally remain zero because some
  transaction consumers do not enforce network identity; do not populate them
  with live addresses to silence a warning. The verifier rejects zero addresses before invoking the explorer. Inspect each
  summary entry rather than treating an omitted contract as verified.
- **Constructor mismatch** – reconcile the original deployment transaction,
  saved constructor arguments and matching build before correcting the selected
  argument file. Preserve the originals. Never substitute a new compiler build
  or controller arguments for an already-deployed implementation.
- **Already verified** – the command reports `already_verified` but exits
  successfully. The summary still records the contract to provide an audit
  trail.

A successful signed `v*` production workflow retains its verification summary.
Review each contract result and the source/build identity. A `source-v*` release
only preserves source and evidence; it does not submit verification, transact,
commission the deployment or certify flawless operation.
