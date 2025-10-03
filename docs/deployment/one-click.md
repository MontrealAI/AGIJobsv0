# One-Click Deployment Guide

This guide walks through the new "one-click" experience for provisioning AGI Jobs v0. The workflow packages every off-chain
component into container images, automates contract deployment, applies secure defaults, and documents the final configuration
so operators can launch safely with minimal manual steps.

## Prerequisites

1. **Node.js 20+** – install dependencies and run the deployment scripts.
2. **Docker 24+** – build and run the container stack.
3. **Hardhat environment variables** – export a deployer private key (`PRIVATE_KEY`) and Ethereum RPC URL (`HARDHAT_NETWORK`
   or `--network` flag). The deployer must control the governance multisig or temporary owner address defined in your config.
4. **AGIALPHA token** – on production networks the canonical token must already exist. For testing, use Sepolia or a fork.

## Step 1: Prepare configuration

1. Copy the environment template and tailor values for your deployment:

   ```bash
   cp deployment-config/oneclick.env.example deployment-config/oneclick.env
   ```

   Update RPC URLs, API tokens, and address placeholders once contracts have been deployed.

2. Customise `deployment-config/deployer.sample.json` and commit a copy (for example
   `deployment-config/sepolia.json`). Key fields:

   | Field | Description |
   | --- | --- |
   | `network` | Hardhat network key (e.g. `sepolia`, `mainnet`). |
   | `governance` | Address that will control the deployed contracts. |
   | `econ` | Economic parameters for fees, burn, staking, and dispute windows. |
   | `secureDefaults` | Launch-time safety rails (pause state, job caps, validator timing). |
   | `output` | Path that will receive the generated address book (defaults to `deployment-config/latest-deployment.json`). |

## Step 2: Deploy and secure contracts

Run the orchestrated deployment helper. The script prompts for confirmation, executes the Hardhat deployment, and applies the
secure defaults defined in the config file (pause switches, capped rewards, and minimal validator windows).

```bash
npm run deploy:oneclick -- --config deployment-config/sepolia.json --network sepolia --yes
```

Outputs:

- `docs/deployment-addresses.json` – canonical address book (updated in-place).
- `deployment-config/latest-deployment.json` (or the configured `output`) – copy for operators and automation tooling.
- Console log showing each governance action (pausing, job caps, validator windows).

## Step 3: Configure the runtime environment

Update `deployment-config/oneclick.env` with the addresses from `latest-deployment.json`. The key variables consumed by the
containers are:

- `JOB_REGISTRY`, `STAKE_MANAGER_ADDRESS`, `VALIDATION_MODULE_ADDRESS`, `DISPUTE_MODULE_ADDRESS`, `REPUTATION_ENGINE_ADDRESS`
- `SYSTEM_PAUSE_ADDRESS` (used to unpause later)
- `AGIALPHA_TOKEN`, `AGIALPHA_DECIMALS`
- `ONEBOX_API_TOKEN`, `GATEWAY_API_KEY`, `ONEBOX_RELAYER_PRIVATE_KEY`

Commit the updated `.env` file (excluding secrets) or store it in your secrets manager.

## Step 4: Launch the container stack

The entire off-chain stack – orchestrator, meta API, agent/validator gateway, Alpha bridge, notification service, mock AA
providers, and both front-ends – now ships as a Docker Compose bundle.

```bash
docker compose --env-file deployment-config/oneclick.env up --build
```

Services exposed:

| Service | Port | Description |
| --- | --- | --- |
| `meta-api` | 8000 | FastAPI router exposing `/onebox/*` and `/meta-orchestrator` endpoints. |
| `orchestrator` | 8080 | Express orchestrator with policy guardrails and One-Box UX API. |
| `agent-gateway` | 8090 | Agent & validator gateway with telemetry, audit anchoring, and notification hooks. |
| `alpha-bridge` | 50052 | gRPC bridge proxying AGI-Alpha planning endpoints. |
| `notifications` | 8075 | Minimal notification capture service writing JSONL audit logs. |
| `validator-ui` | 3000 | Validator dashboard (Next.js). |
| `enterprise-portal` | 3001 | Employer / enterprise front-end. |
| `bundler`, `paymaster-supervisor`, `attester` | 4337 / 4000 / 7000 | Mock AA infrastructure for local testing. |
| `anvil` | 8545 | Optional local EVM node for rapid iteration. |

Volumes persist orchestrator run history, gateway logs, and notification audit trails under `orchestrator_state`,
`orchestrator_logs`, `gateway_storage`, `gateway_logs`, and `notification_logs`.

## Step 5: Post-launch checklist

1. **Verify pause state** – contracts start paused. After double-checking settings, call `SystemPause.unpauseAll` via your
   governance multisig to go live.
2. **Update `.env` with production URLs** – point front-ends to your public domain.
3. **Scale beyond Docker Compose** – optional: translate `compose.yaml` into Kubernetes manifests (the services use distinct
   Dockerfiles with environment-driven configuration).
4. **Document addresses** – store `latest-deployment.json` in your secrets vault or ops repo for incident response.

## Troubleshooting

- **Deployment fails fetching AGIALPHA decimals** – ensure you target a network where the canonical token is deployed (mainnet /
  Sepolia) or deploy a mock token at that address for private forks.
- **Services crash on missing addresses** – double-check `deployment-config/oneclick.env` matches the generated address book.
- **Notification service** – notifications persist in `notification_logs` volume as JSON lines; mount the volume or use the
  `/notifications` endpoint for inspection.

With these pieces in place the "one-click" workflow takes you from zero to a fully wired stack with safe defaults in a single
command, ready for further tuning via the governance scripts in `scripts/v2`.
