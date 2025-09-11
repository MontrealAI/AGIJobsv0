# Deploying AGIJobs v2 to Ethereum Mainnet (CLI Guide)

This guide walks through a production‑grade deployment of the AGIJobs v2
contracts to Ethereum mainnet using the Truffle CLI. It assumes you are
deploying the canonical $AGIALPHA stack and want all modules wired together
in one transaction.

## Prerequisites

1. **Node & npm** – Use Node 20.x and npm 10+. A matching `nvm` version is
   recommended.
2. **Dependencies** – Clone the repository and install packages:
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   npm install
   ```
3. **Truffle** – Install Truffle globally or use `npx`:
   ```bash
   npm install -g truffle
   ```
4. **Ethereum access** – An RPC endpoint (Infura/Alchemy etc.) and a deployer
   private key with enough ETH.
5. **Governance address** – Multisig or timelock that will own the system.
6. **Etherscan API key** – Enables automatic verification.

## Environment variables

Create a `.env` file or export the variables before running Truffle:

```bash
export MAINNET_PRIVATE_KEY="0x..."         # deployer key
export MAINNET_RPC_URL="https://mainnet.infura.io/v3/<id>"
export GOVERNANCE_ADDRESS="0xYourMultisig"
export ETHERSCAN_API_KEY="YourKey"         # optional but recommended
# Optional overrides
export FEE_PCT=5                           # protocol fee (0‑100)
export BURN_PCT=5                          # burn percentage (0‑100)
export NO_TAX=true                         # set to skip TaxPolicy
```

The `$AGIALPHA` token address and decimals are fixed in
`config/agialpha.json` and compiled into the contracts; no extra token
configuration is required.

## Compile

```bash
truffle compile
```

## Deploy

Run the migration for mainnet. The repository already includes a migration that
deploys and wires the entire module set:

```bash
truffle migrate --network mainnet
```

The script prints the addresses for StakeManager, JobRegistry, ValidationModule
and the rest. Save them for later use.

## Verify

After deployment, verify the contracts on Etherscan. Example:

```bash
truffle run verify Deployer StakeManager JobRegistry ValidationModule \
  ReputationEngine DisputeModule CertificateNFT PlatformRegistry JobRouter \
  PlatformIncentives FeePool TaxPolicy IdentityRegistry SystemPause \
  --network mainnet
```

Only include `TaxPolicy` in the command if you did not set `NO_TAX`.

## Post‑deployment checks

1. Confirm each contract is owned by your governance address (or by the
   `SystemPause` contract where applicable).
2. Test pausing and unpausing through the `SystemPause` contract.
3. Optionally run `npm run verify:wiring` to ensure all module addresses point
   to each other correctly.

With these steps you have a repeatable, production‑ready path for launching
AGIJobs v2 to Ethereum mainnet using the Truffle CLI.
